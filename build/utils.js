"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const glob_1 = require("glob");
exports.addedFiles = (files) => files.filter(file => (file.status === "added"));
exports.modifiedFiles = (files) => files.filter(file => (file.status === "modified"));
exports.deletedFiles = (files) => files.filter(file => (file.status === "deleted"));
// Process the list of files being committed to return the list of eligible filters (whose filename matches their regExp)
exports.processListFilesResponses = (files, filters, log) => {
    log.info('file statuses: ', files.map(file => [file.filename, file.status]));
    const eligible_nonstatus_filters = filters.filter(filter => files.find(file => new RegExp(filter.regExp).test(file.filename))
        && !filter.addedOnly
        && !filter.modifiedOnly
        && !filter.deletedOnly);
    const eligible_added_filters = filters.filter(filter => filter.addedOnly && exports.addedFiles(files).find(file => new RegExp(filter.regExp).test(file.filename)));
    log.info(eligible_added_filters);
    log.info(exports.addedFiles(files));
    log.info(exports.addedFiles(files).map(file => [file.filename, new glob_1.glob('jobs/*/*.rb').test(file.filename)]));
    const eligible_modified_filters = filters.filter(filter => filter.modifiedOnly && exports.modifiedFiles(files).find(file => new RegExp(filter.regExp).test(file.filename)));
    const eligible_deleted_filters = filters.filter(filter => filter.deletedOnly && exports.deletedFiles(files).find(file => new RegExp(filter.regExp).test(file.filename)));
    return [...eligible_nonstatus_filters, ...eligible_added_filters, ...eligible_modified_filters, ...eligible_deleted_filters];
};
// Filter the list of provided labels to return those that are part of provided filters
exports.filterConfiguredIssueLabels = (labels, filters) => {
    const configuredLabels = filters.reduce((acc, filter) => acc.concat(filter.labels), []);
    // To filter and have a distinct list of labels to remove
    return [...new Set(configuredLabels.filter(label => labels.includes(label)))];
};
// Build a list of IssueRemoveLabelParams from the list of provided labels
exports.buildIssueRemoveLabelParams = ({ repo, issue_number, owner }, labels) => {
    return labels.map(label => ({
        issue_number,
        name: label,
        owner,
        repo
    }));
};
// Filter over the provided labels to return only those that do not appear in provided standard list
exports.intersectLabels = (labels, standard) => labels.filter(label => !standard.includes(label));
//# sourceMappingURL=utils.js.map