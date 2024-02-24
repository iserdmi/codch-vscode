const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

const isFilePath = (string) => {
  return string.match(/^[a-zA-Z0-9_\-\.\/]+$/)
}
const extractFilePathFromLine = (line) => {
  const filePath = line.split(' ').reverse()[0]
  if (isFilePath(filePath)) {
    return filePath
  }
  return null
}

function activate(context) {
  let provider = new CodchLinkProvider();
  let registrationLinkProvider = vscode.languages.registerDocumentLinkProvider({ scheme: 'file', language: 'codch' }, provider);
  let registrationCompletionProvider = vscode.languages.registerCompletionItemProvider(
    { scheme: 'file', language: 'codch' },
    new CodchCompletionItemProvider(),
    '/', // Trigger completion on '/'
    '\\' // For Windows paths
  );
  context.subscriptions.push(registrationLinkProvider, registrationCompletionProvider);
}

class CodchLinkProvider {
  provideDocumentLinks(document, token) {
    try {
      const text = document.getText();
      const links = [];
      const filePathRegex = /^(inspiration|context|output):\s*\n((?:.*\n)+?)(?=\n\w+:|$)/gm;
      let match;
      while ((match = filePathRegex.exec(text)) !== null) {
        const pathsBlock = match[2].trim();
        const paths = pathsBlock.split(/\n/);
        let lastProcessdLineEndIndex = match.index + match[0].indexOf(pathsBlock);
        for (let filePath of paths) {
          const filePathAbs = path.isAbsolute(filePath) ? filePath : path.join(path.dirname(document.uri.fsPath), filePath);
          const filePathStartIndex = lastProcessdLineEndIndex + 1
          const filePathEndIndex = filePathStartIndex + filePath.length
          lastProcessdLineEndIndex = filePathEndIndex
          const range = new vscode.Range(
            document.positionAt(filePathStartIndex),
            document.positionAt(filePathEndIndex)
          );
          links.push(new vscode.DocumentLink(range, vscode.Uri.file(filePathAbs)));
        }
      }

      return links;
    }
    catch (error) {
      console.error(error);
      return [];
    }
  }
}

class CodchCompletionItemProvider {
  provideCompletionItems(document, position) {
    try {
      const linePrefix = document.lineAt(position).text.substr(0, position.character);
      const linePrefixPrefix = linePrefix.substring(0, position.character);
      const filePath = extractFilePathFromLine(linePrefixPrefix);
      if (!filePath) {
        return undefined;
      }
      let filePathAbs = path.isAbsolute(filePath) ? filePath : path.join(path.dirname(document.uri.fsPath), filePath);
      const filePathDirAbs = filePathAbs.endsWith('/') ? filePathAbs : path.dirname(filePathAbs);

      const files = fs.readdirSync(filePathDirAbs);
      return files.map(file => {
        try {
          const filePath = path.join(filePathDirAbs, file);
          const isDirectory = fs.statSync(filePath).isDirectory();
          const completionItem = new vscode.CompletionItem(file, isDirectory ? vscode.CompletionItemKind.Folder : vscode.CompletionItemKind.File);
          if (isDirectory) {
            completionItem.insertText = file + '/'
            completionItem.command = { command: 'editor.action.triggerSuggest', title: 'Re-trigger completions' };
          }
          return completionItem;
        } catch (error) {
          console.warn(error);
          return null;
        }
      }).filter(Boolean);
    } catch (error) {
      console.error(error);
      return [];
    }
  }
}


exports.activate = activate;