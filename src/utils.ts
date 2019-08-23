import { IssuesRemoveLabelParams, PullsListFilesResponseItem } from '@octokit/rest';
import { Filter, Repository } from './types';
import { LoggerFunc, Signale } from 'signale';
import { glob } from 'glob';

export const addedFiles = (files: PullsListFilesResponseItem[]): PullsListFilesResponseItem[] =>
  files.filter(file => (file.status === "added"));

export const modifiedFiles = (files: PullsListFilesResponseItem[]): PullsListFilesResponseItem[] =>
  files.filter(file => (file.status === "modified"));

export const deletedFiles = (files: PullsListFilesResponseItem[]): PullsListFilesResponseItem[] =>
  files.filter(file => (file.status === "deleted"))

// Process the list of files being committed to return the list of eligible filters (whose filename matches their regExp)
export const processListFilesResponses = (files: PullsListFilesResponseItem[], filters: Filter[], log: LoggerFunc & Signale): Filter[] => {
  log.info('file statuses: ', files.map(file => [file.filename, file.status]));
  const eligible_nonstatus_filters: Filter[] = filters.filter(filter => files.find(file => new RegExp(filter.regExp).test(file.filename))
    && !filter.addedOnly
    && !filter.modifiedOnly
    && !filter.deletedOnly);
  const eligible_added_filters: Filter[] = filters.filter(filter => filter.addedOnly && addedFiles(files).find(file => new RegExp(filter.regExp).test(file.filename)));
  log.info(eligible_added_filters);
  log.info(addedFiles(files));
  log.info(addedFiles(files).map(file => [file.filename, new glob('jobs/*/*.rb').test(file.filename)]));
  const eligible_modified_filters: Filter[] = filters.filter(filter => filter.modifiedOnly && modifiedFiles(files).find(file => new RegExp(filter.regExp).test(file.filename)));
  const eligible_deleted_filters: Filter[] = filters.filter(filter => filter.deletedOnly && deletedFiles(files).find(file => new RegExp(filter.regExp).test(file.filename)));
  return [...eligible_nonstatus_filters, ...eligible_added_filters, ...eligible_modified_filters, ...eligible_deleted_filters];
};
// Filter the list of provided labels to return those that are part of provided filters
export const filterConfiguredIssueLabels = (labels: string[], filters: Filter[]): string[] => {
  const configuredLabels: string[] = filters.reduce((acc: string[], filter: Filter) => acc.concat(filter.labels), []);
  // To filter and have a distinct list of labels to remove
  return [...new Set(configuredLabels.filter(label => labels.includes(label)))];
};

// Build a list of IssueRemoveLabelParams from the list of provided labels
export const buildIssueRemoveLabelParams = ({ repo, issue_number, owner }: Repository, labels: string[]): IssuesRemoveLabelParams[] => {
  return labels.map(label => ({
    issue_number,
    name: label,
    owner,
    repo
  }));
};

// Filter over the provided labels to return only those that do not appear in provided standard list
export const intersectLabels = (labels: string[], standard: string[]): string[] =>
  labels.filter(label => !standard.includes(label));
