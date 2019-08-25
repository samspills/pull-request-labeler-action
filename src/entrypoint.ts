import { IssuesAddLabelsParams, IssuesRemoveLabelParams, IssuesAddLabelsResponseItem, IssuesRemoveLabelResponseItem, IssuesListLabelsOnIssueParams, IssuesListLabelsOnIssueResponse, PullsListFilesParams, PullsListFilesResponse, PullsListFilesResponseItem, Response } from '@octokit/rest';
import { Toolkit, ToolkitOptions } from 'actions-toolkit';
// tslint:disable-next-line:no-submodule-imports
import { WebhookPayloadWithRepository } from 'actions-toolkit/lib/context';
// tslint:disable-next-line:no-submodule-imports
import { Exit } from 'actions-toolkit/lib/exit';
// tslint:disable-next-line:no-submodule-imports
import { GitHub } from 'actions-toolkit/lib/github';
import { LoggerFunc, Signale } from 'signale';
import { Filter, Repository } from './types';
import { buildIssueRemoveLabelParams, filterConfiguredIssueLabels, intersectLabels, processListFilesResponses } from './utils';
import * as yaml from 'js-yaml';

const LOGO: string = `
██████╗ ███████╗ ██████╗ █████╗ ████████╗██╗  ██╗██╗      ██████╗ ███╗   ██╗
██╔══██╗██╔════╝██╔════╝██╔══██╗╚══██╔══╝██║  ██║██║     ██╔═══██╗████╗  ██║
██║  ██║█████╗  ██║     ███████║   ██║   ███████║██║     ██║   ██║██╔██╗ ██║
██║  ██║██╔══╝  ██║     ██╔══██║   ██║   ██╔══██║██║     ██║   ██║██║╚██╗██║
██████╔╝███████╗╚██████╗██║  ██║   ██║   ██║  ██║███████╗╚██████╔╝██║ ╚████║
╚═════╝ ╚══════╝ ╚═════╝╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═╝  ╚═══╝
`;

const args: ToolkitOptions = {
  event: ['pull_request.opened', 'pull_request.synchronize'],
  secrets: ['GITHUB_TOKEN']
};

// Returns the repository information using provided gitHubEventPath
const findRepositoryInformation = (gitHubEventPath: string, log: LoggerFunc & Signale, exit: Exit): IssuesListLabelsOnIssueParams => {
  const payload: WebhookPayloadWithRepository = require(gitHubEventPath);
  if (payload.number === undefined) {
    exit.neutral('Action not triggered by a PullRequest action. PR ID is missing')
  }
  log.info(`Checking files list for PR#${payload.number}`);
  return {
    issue_number: payload.number,
    owner: payload.repository.owner.login,
    repo: payload.repository.name
  };
};

// Find configured filters from the issue labels
const findIssueLabels = (issuesListLabelsOnIssueParams: IssuesListLabelsOnIssueParams, issues, filters: Filter[]): Promise<string[]> => {
  // Find issue labels that are configured in .github/label-pr.yml
  return issues.listLabelsOnIssue(issuesListLabelsOnIssueParams)
    .then(({ data: labels }: Response<IssuesListLabelsOnIssueResponse>) => labels.reduce((acc, label) => acc.concat(label.name), []))
    .then(issueLabels => filterConfiguredIssueLabels(issueLabels, filters));
};

const getLabelsToRemove = (labels: string[], issueLabels: string[], { log, exit }: Toolkit): string[] => {
  const labelsToRemove: string[] = intersectLabels(issueLabels, labels);
  if (labelsToRemove.length > 0) {
    log.info('Labels to remove: ', labelsToRemove);
  }
  return labelsToRemove;
};

// Build labels to add
const getLabelsToAdd = (labels: string[], issueLabels: string[], { log, exit }: Toolkit): string[] => {
  const labelsToAdd: string[] = intersectLabels(labels, issueLabels);
  if (labelsToAdd.length > 0) {
    log.info('Labels to add: ', labelsToAdd);
  }
  return labelsToAdd;
};

async function fetchContent(
  client: Toolkit["github"],
  context: Toolkit["context"],
  repoPath: string
): Promise<string> {
  const response = await client.repos.getContents({
    owner: context.repo.owner,
    repo: context.repo.repo,
    path: repoPath,
    ref: context.sha
  });
  return Buffer.from(response.data.content, 'base64').toString();
}

Toolkit.run(async (toolkit: Toolkit) => {
  toolkit.log.info('Open sourced by\n' + LOGO);

  toolkit.log.info('Running Action');

  toolkit.log.info('Getting configuration file')
  const configContent: string = await fetchContent(toolkit.github, toolkit.context, '.github/label-pr.yml')
  const filters: Filter[] = yaml.safeLoad(configContent)

  // const filters: Filter[] = toolkit.config('.github/label-pr.yml');
  toolkit.log.info(" Configured filters: ", filters);

  if (!process.env.GITHUB_EVENT_PATH) {
    toolkit.exit.failure('Process env GITHUB_EVENT_PATH is undefined');
  } else {
    const { owner, issue_number, repo }: IssuesListLabelsOnIssueParams = findRepositoryInformation(process.env.GITHUB_EVENT_PATH, toolkit.log, toolkit.exit);
    const { pulls: { listFiles }, issues }: GitHub = toolkit.github;

    // First, we need to retrieve the existing issue labels and filter them over the configured one in config file
    const issueLabels: string[] = await findIssueLabels({ issue_number, owner, repo }, issues, filters);

    const params: PullsListFilesParams = { owner, pull_number: issue_number, repo };

    const labelsToProcess: Promise<void | string[]> = listFiles(params)
      .then((response: Response<PullsListFilesResponse>) => response.data)
      .then((files: PullsListFilesResponseItem[]) => {
        toolkit.log.info('Checking files...')
        files.map(file => toolkit.log.info(file.filename, file.status));
        return files;
      })
      .then((files: PullsListFilesResponseItem[]) => processListFilesResponses(files, filters, toolkit.log))
      .then((eligibleFilters: Filter[]) => eligibleFilters.reduce((acc: string[], eligibleFilter: Filter) => acc.concat(eligibleFilter.labels), []))
      .catch(reason => toolkit.exit.failure(reason));

    await labelsToProcess
      .then((labels: string[]) => getLabelsToRemove(labels, issueLabels, toolkit))
      .then((labelsToRemove: string[]) => {
        if (labelsToRemove.length === 0) {
          throw ('No labels to remove; abandoning removal process');
        }
        return labelsToRemove;
      })
      .then((labelsToRemove: string[]) => labelsToRemove.map(label => ({ issue_number, name: label, owner, repo })))
      .then((removeLabelParams: IssuesRemoveLabelParams[]) => removeLabelParams.map(params => issues.removeLabel(params)))
      .catch(reason => toolkit.log.info(reason));

    await labelsToProcess
      .then((labels: string[]) => getLabelsToAdd(labels, issueLabels, toolkit))
      .then((labelsToAdd: string[]) => {
        if (labelsToAdd.length === 0) {
          throw ('No labels to add; abandoning addition process');
        }
        return labelsToAdd;
      })
      .then((labelsToAdd: string[]) => ({ issue_number, labels: labelsToAdd, owner, repo }))
      .then((addLabelsParams: IssuesAddLabelsParams) => issues.addLabels(addLabelsParams))
      .catch(reason => toolkit.log.info(reason));
  }
  toolkit.exit.success('Labels were successfully updated')
},
  args
);
