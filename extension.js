const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

const sectionNamesWithFilePaths = ['knowledge', 'context', 'output']

const extractSectionInfo = (text, sectionName) => {
  const regex = new RegExp(`\\[${sectionName}\\]\\s*\\n([\\s\\S]*?)\\n\\[\\/${sectionName}\\]`, 'i');
  const match = text.match(regex);
  const result = { contentStartIndex: null, contentEndIndex: null, content: null, lines: [] }
  if (!match) {
    return result
  }
  result.content = match[1].trim()
  result.contentStartIndex = match.index + match[0].indexOf(result.content)
  result.contentEndIndex = result.contentStartIndex + result.content.length
  result.lines = result.content.split('\n')
  return result
}

const isPositionInSections = (document, position, sectionsNames) => {
  const text = document.getText();
  const positionIndex = document.offsetAt(position)
  const sectionsInfos = sectionsNames.map(sectionName => extractSectionInfo(text, sectionName))
  for (const sectionInfo of sectionsInfos) {
    if (sectionInfo.contentStartIndex !== null && sectionInfo.contentEndIndex !== null &&
      sectionInfo.contentStartIndex <= positionIndex && positionIndex <= sectionInfo.contentEndIndex) {
      return true
    }
  }
  return false
}

function activate(context) {
  const registrationLinkProvider = vscode.languages.registerDocumentLinkProvider(
    { scheme: 'file', language: 'codch' },
    new CodchLinkProvider()
  );
  const registrationCompletionProvider = vscode.languages.registerCompletionItemProvider(
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
      for (const sectionName of sectionNamesWithFilePaths) {
        const sectionInfo = extractSectionInfo(text, sectionName)
        if (!sectionInfo.lines.length) {
          continue
        }
        let lastProcessedLineEndIndex = sectionInfo.contentStartIndex
        for (const line of sectionInfo.lines) {
          const nextLastProcessedLineEndIndex = lastProcessedLineEndIndex + line.length + 1
          const lineTrimmed = line.trim()
          if (!lineTrimmed) {
            lastProcessedLineEndIndex = nextLastProcessedLineEndIndex
            continue
          }
          const isLineStartsWithMuchComments = /^[#\s^n]*##+/.test(lineTrimmed)
          if (isLineStartsWithMuchComments) {
            lastProcessedLineEndIndex = nextLastProcessedLineEndIndex
            continue
          }
          const filePath = /^[#\s^n]*([^#\s]+)/.exec(lineTrimmed)[1]
          if (!filePath) {
            lastProcessedLineEndIndex = nextLastProcessedLineEndIndex
            continue
          }
          const filePathAbs = path.isAbsolute(filePath) ? filePath : path.join(path.dirname(document.uri.fsPath), filePath);
          const filePathStartIndex = lastProcessedLineEndIndex + line.indexOf(filePath);
          const filePathEndIndex = filePathStartIndex + filePath.length;
          lastProcessedLineEndIndex += line.length + 1
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
      const line = document.lineAt(position).text;
      const linePrefix = line.substr(0, position.character);

      const isFilePathCompletionRequired = isPositionInSections(document, position, sectionNamesWithFilePaths)
      if (isFilePathCompletionRequired) {
        const filePath = linePrefix.split(/[\s#]/g).reverse()[0]
        if (!filePath) {
          return undefined;
        }
        const filePathAbs = path.isAbsolute(filePath) ? filePath : path.join(path.dirname(document.uri.fsPath), filePath);
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
      }
      return [];
    } catch (error) {
      console.error(error);
      return [];
    }
  }
}

exports.activate = activate;