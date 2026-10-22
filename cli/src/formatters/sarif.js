/**
 * SARIF 2.1.0 Formatter (Static Analysis Results Interchange Format)
 */

export const formatSarif = (report) => {
  const sarifLog = {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'secure-cicd',
            version: '1.0.0',
            informationUri: 'https://github.com/Deepanshu12344/secure_cicd_pipeline',
            rules: report.issues.map((issue) => ({
              id: issue.id,
              name: issue.title,
              shortDescription: { text: issue.title },
              fullDescription: { text: issue.description },
              help: { text: issue.remediation },
              properties: {
                problem: {
                  severity: issue.severity.toLowerCase()
                }
              }
            }))
          }
        },
        results: report.issues.map((issue) => ({
          ruleId: issue.id,
          message: { text: `${issue.title}: ${issue.description}` },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: issue.file },
                region: { startLine: issue.line || 1 }
              }
            }
          ]
        }))
      }
    ]
  };

  return JSON.stringify(sarifLog, null, 2);
};
