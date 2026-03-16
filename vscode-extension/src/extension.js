const vscode = require('vscode');
const axios = require('axios');

let diagnosticCollection;

async function activate(context) {
  console.log('SecureCI/CD Extension is now active');

  diagnosticCollection = vscode.languages.createDiagnosticCollection('secureCicd');
  context.subscriptions.push(diagnosticCollection);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('secureCicd.scanWorkspace', scanWorkspace),
    vscode.commands.registerCommand('secureCicd.scanFile', scanCurrentFile),
    vscode.commands.registerCommand('secureCicd.viewRisks', viewRisks),
    vscode.commands.registerCommand('secureCicd.configureProject', configureProject)
  );

  // Create status bar item
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'secureCicd.viewRisks';
  statusBar.text = '$(shield) SecureCI/CD: Ready';
  statusBar.show();
  context.subscriptions.push(statusBar);

  // Auto-scan on file save if enabled
  const config = vscode.workspace.getConfiguration('secureCicd');
  if (config.get('autoScan')) {
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument(scanCurrentFile)
    );
  }

  // Update status bar
  setInterval(() => {
    statusBar.text = `$(shield) SecureCI/CD: Active - ${new Date().toLocaleTimeString()}`;
  }, 60000);
}

async function scanWorkspace() {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    vscode.window.showErrorMessage('No workspace folder open');
    return;
  }

  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Scanning workspace for security risks...',
      cancellable: false
    },
    async (progress) => {
      try {
        progress.report({ increment: 30 });
        
        const config = vscode.workspace.getConfiguration('secureCicd');
        const apiUrl = config.get('apiUrl');
        
        progress.report({ increment: 50 });
        
        const response = await axios.post(`${apiUrl}/scans`, {
          projectId: workspaceFolders[0].name,
          repositoryUrl: workspaceFolders[0].uri.fsPath,
          scanType: 'full'
        });

        progress.report({ increment: 20 });

        vscode.window.showInformationMessage(
          `✓ Scan completed: ${response.data.data.findings?.length || 0} issues found`
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Scan failed: ${error.message}`);
      }
    }
  );
}

async function scanCurrentFile() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No file open');
    return;
  }

  try {
    const config = vscode.workspace.getConfiguration('secureCicd');
    const apiUrl = config.get('apiUrl');
    
    const code = editor.document.getText();
    const language = editor.document.languageId;

    const response = await axios.post(`${apiUrl}/analyze`, {
      code,
      language
    });

    displayDiagnostics(editor.document, response.data.data.vulnerabilities);
    
    vscode.window.showInformationMessage(
      `File scanned: Risk score ${response.data.data.risk_score}/10`
    );
  } catch (error) {
    vscode.window.showErrorMessage(`File scan failed: ${error.message}`);
  }
}

function displayDiagnostics(document, vulnerabilities) {
  const diagnostics = vulnerabilities.map(vuln => {
    const range = new vscode.Range(0, 0, 0, 10);
    const severity = vuln.severity === 'CRITICAL' 
      ? vscode.DiagnosticSeverity.Error
      : vuln.severity === 'HIGH'
      ? vscode.DiagnosticSeverity.Warning
      : vscode.DiagnosticSeverity.Information;

    return new vscode.Diagnostic(
      range,
      `[SecureCI/CD] ${vuln.type}: ${vuln.severity}`,
      severity
    );
  });

  diagnosticCollection.set(document.uri, diagnostics);
}

async function viewRisks() {
  vscode.window.showInformationMessage('Open SecureCI/CD dashboard for detailed risk analysis');
}

async function configureProject() {
  const config = vscode.workspace.getConfiguration('secureCicd');
  vscode.window.showQuickPick(['low', 'medium', 'high', 'critical']).then(selected => {
    if (selected) {
      config.update('riskThreshold', selected, vscode.ConfigurationTarget.Workspace);
      vscode.window.showInformationMessage(`Risk threshold set to: ${selected}`);
    }
  });
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
