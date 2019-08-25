"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const actions_toolkit_1 = require("actions-toolkit");
const utils_1 = require("./utils");
const yaml = __importStar(require("js-yaml"));
const LOGO = `
██████╗ ███████╗ ██████╗ █████╗ ████████╗██╗  ██╗██╗      ██████╗ ███╗   ██╗
██╔══██╗██╔════╝██╔════╝██╔══██╗╚══██╔══╝██║  ██║██║     ██╔═══██╗████╗  ██║
██║  ██║█████╗  ██║     ███████║   ██║   ███████║██║     ██║   ██║██╔██╗ ██║
██║  ██║██╔══╝  ██║     ██╔══██║   ██║   ██╔══██║██║     ██║   ██║██║╚██╗██║
██████╔╝███████╗╚██████╗██║  ██║   ██║   ██║  ██║███████╗╚██████╔╝██║ ╚████║
╚═════╝ ╚══════╝ ╚═════╝╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═╝  ╚═══╝
`;
const args = {
    event: ['pull_request.opened', 'pull_request.synchronize'],
    secrets: ['GITHUB_TOKEN']
};
// Returns the repository information using provided gitHubEventPath
const findRepositoryInformation = (gitHubEventPath, log, exit) => {
    const payload = require(gitHubEventPath);
    if (payload.number === undefined) {
        exit.neutral('Action not triggered by a PullRequest action. PR ID is missing');
    }
    log.info(`Checking files list for PR#${payload.number}`);
    return {
        issue_number: payload.number,
        owner: payload.repository.owner.login,
        repo: payload.repository.name
    };
};
// Find configured filters from the issue labels
const findIssueLabels = (issuesListLabelsOnIssueParams, issues, filters) => {
    // Find issue labels that are configured in .github/label-pr.yml
    return issues.listLabelsOnIssue(issuesListLabelsOnIssueParams)
        .then(({ data: labels }) => labels.reduce((acc, label) => acc.concat(label.name), []))
        .then(issueLabels => utils_1.filterConfiguredIssueLabels(issueLabels, filters));
};
const getLabelsToRemove = (labels, issueLabels, { log, exit }) => {
    const labelsToRemove = utils_1.intersectLabels(issueLabels, labels);
    log.info('Labels to remove: ', labelsToRemove);
    if (labelsToRemove.length === 0) {
        exit.neutral("No labels to remove");
    }
    return labelsToRemove;
};
// Build labels to add
const getLabelsToAdd = (labels, issueLabels, { log, exit }) => {
    const labelsToAdd = utils_1.intersectLabels(labels, issueLabels);
    log.info('Labels to add: ', labelsToAdd);
    if (labelsToAdd.length === 0) {
        log.info("No labels to add");
    }
    return labelsToAdd;
};
async function fetchContent(client, context, repoPath) {
    const response = await client.repos.getContents({
        owner: context.repo.owner,
        repo: context.repo.repo,
        path: repoPath,
        ref: context.sha
    });
    return Buffer.from(response.data.content, 'base64').toString();
}
actions_toolkit_1.Toolkit.run(async (toolkit) => {
    toolkit.log.info('Open sourced by\n' + LOGO);
    toolkit.log.info('Running Action');
    toolkit.log.info('Getting configuration file');
    const configContent = await fetchContent(toolkit.github, toolkit.context, '.github/label-pr.yml');
    const filters = yaml.safeLoad(configContent);
    // const filters: Filter[] = toolkit.config('.github/label-pr.yml');
    toolkit.log.info(" Configured filters: ", filters);
    if (!process.env.GITHUB_EVENT_PATH) {
        toolkit.exit.failure('Process env GITHUB_EVENT_PATH is undefined');
    }
    else {
        const { owner, issue_number, repo } = findRepositoryInformation(process.env.GITHUB_EVENT_PATH, toolkit.log, toolkit.exit);
        const { pulls: { listFiles }, issues } = toolkit.github;
        // First, we need to retrieve the existing issue labels and filter them over the configured one in config file
        const issueLabels = await findIssueLabels({ issue_number, owner, repo }, issues, filters);
        const params = { owner, pull_number: issue_number, repo };
        const labelsToProcess = listFiles(params)
            .then((response) => response.data)
            .then((files) => {
            toolkit.log.info('Checking files...', files.reduce((acc, file) => acc.concat(file.filename), []));
            return files;
        })
            .then((files) => utils_1.processListFilesResponses(files, filters, toolkit.log))
            .then((eligibleFilters) => eligibleFilters.reduce((acc, eligibleFilter) => acc.concat(eligibleFilter.labels), []))
            .catch(reason => toolkit.exit.failure(reason));
        await labelsToProcess
            .then((labels) => getLabelsToRemove(labels, issueLabels, toolkit))
            .then((labelsToRemove) => {
            if (labelsToRemove.length === 0) {
                throw ('No labels to remove; abandoning removal process');
            }
            return labelsToRemove;
        })
            .then((labelsToRemove) => labelsToRemove.map(label => ({ issue_number, name: label, owner, repo })))
            .then((removeLabelParams) => removeLabelParams.map(params => issues.removeLabel(params)))
            .catch(reason => toolkit.log.error(reason));
        await labelsToProcess
            .then((labels) => getLabelsToAdd(labels, issueLabels, toolkit))
            .then((labelsToAdd) => {
            if (labelsToAdd.length === 0) {
                throw ('No labels to add; abandoning addition process');
            }
            return labelsToAdd;
        })
            .then((labelsToAdd) => ({ issue_number, labels: labelsToAdd, owner, repo }))
            .then((addLabelsParams) => issues.addLabels(addLabelsParams))
            .catch(reason => toolkit.log.error(reason));
    }
    toolkit.exit.success('Labels were update into pull request');
}, args);
//# sourceMappingURL=entrypoint.js.map