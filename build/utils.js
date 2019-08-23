"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addedFiles = (files) => files.filter(file => (file.status === "Added"));
exports.modifiedFiles = (files) => files.filter(file => (file.status === "Modified"));
exports.deletedFiles = (files) => files.filter(file => (file.status === "Deleted"));
// Process the list of files being committed to return the list of eligible filters (whose filename matches their regExp)
exports.processListFilesResponses = (files, filters) => filters
    .filter(filter => files.find(file => new RegExp(filter.regExp).test(file.filename)))
    .filter(filter => ((!filter.addedOnly || (filter.addedOnly && exports.addedFiles(files).find(file => new RegExp(filter.regExp).test(file.filename))))))
    .filter(filter => ((!filter.modifiedOnly || (filter.modifiedOnly && exports.modifiedFiles(files).find(file => new RegExp(filter.regExp).test(file.filename))))))
    .filter(filter => ((!filter.deletedOnly || (filter.deletedOnly && exports.deletedFiles(files).find(file => new RegExp(filter.regExp).test(file.filename))))));
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