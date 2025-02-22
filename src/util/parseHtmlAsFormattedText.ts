import type { ApiFormattedText, ApiMessageEntity } from '../api/types';
import { ApiMessageEntityTypes } from '../api/types';

export const ENTITY_CLASS_BY_NODE_NAME: Record<string, ApiMessageEntityTypes> = {
  B: ApiMessageEntityTypes.Bold,
  STRONG: ApiMessageEntityTypes.Bold,
  I: ApiMessageEntityTypes.Italic,
  EM: ApiMessageEntityTypes.Italic,
  INS: ApiMessageEntityTypes.Underline,
  U: ApiMessageEntityTypes.Underline,
  S: ApiMessageEntityTypes.Strike,
  STRIKE: ApiMessageEntityTypes.Strike,
  DEL: ApiMessageEntityTypes.Strike,
  CODE: ApiMessageEntityTypes.Code,
  PRE: ApiMessageEntityTypes.Pre,
  BLOCKQUOTE: ApiMessageEntityTypes.Blockquote,
};

interface AstNode {
  type: string;
  content?: string | AstNode[];
  language?: string;
  alt?: string;
  documentId?: string;
  href?: string;
}

const MAX_TAG_DEEPNESS = 3;

export default function parseHtmlAsFormattedText(
  html: string, withMarkdownLinks = false, skipMarkdown = false,
): ApiFormattedText {
  const fragment = document.createElement('div');
  fragment.innerHTML = skipMarkdown ? html
    : withMarkdownLinks ? parseMarkdown(parseMarkdownLinks(html)) : parseMarkdown(html);
  fixImageContent(fragment);
  const text = fragment.innerText.trim().replace(/\u200b+/g, '');
  const trimShift = fragment.innerText.indexOf(text[0]);
  let textIndex = -trimShift;
  let recursionDeepness = 0;
  const entities: ApiMessageEntity[] = [];

  function addEntity(node: ChildNode) {
    if (node.nodeType === Node.COMMENT_NODE) return;
    const { index, entity } = getEntityDataFromNode(node, text, textIndex);

    if (entity) {
      textIndex = index;
      entities.push(entity);
    } else if (node.textContent) {
      // Skip newlines on the beginning
      if (index === 0 && node.textContent.trim() === '') {
        return;
      }
      textIndex += node.textContent.length;
    }

    if (node.hasChildNodes() && recursionDeepness <= MAX_TAG_DEEPNESS) {
      recursionDeepness += 1;
      Array.from(node.childNodes).forEach(addEntity);
    }
  }

  Array.from(fragment.childNodes).forEach((node) => {
    recursionDeepness = 1;
    addEntity(node);
  });

  return {
    text,
    entities: entities.length ? entities : undefined,
  };
}

export function fixImageContent(fragment: HTMLDivElement) {
  fragment.querySelectorAll('img').forEach((node) => {
    if (node.dataset.documentId) { // Custom Emoji
      node.textContent = (node as HTMLImageElement).alt || '';
    } else { // Regular emoji with image fallback
      node.replaceWith(node.alt || '');
    }
  });
}

function generateAST(input: string, startIndex = 0): AstNode {
  const root: AstNode = { type: 'root', content: [] };
  let currentText = '';
  let i = startIndex;

  while (i < input.length) {
    const char = input[i];

    // Handle code blocks (```)
    if (char === '`' && input.slice(i, i + 3) === '```') {
      if (currentText) {
        (root.content as AstNode[]).push({ type: 'text', content: currentText });
        currentText = '';
      }

      i += 3; // Skip ```
      let language = '';
      let codeContent = '';
      let hasNewline = false;

      // Check if there's a newline after ```
      if (i < input.length && (input[i] === '\n' || input[i] === '\r')) {
        hasNewline = true;
        i++; // Skip the newline
        // Read the language (if present) only if followed by another newline
        while (i < input.length && input[i] !== '\n' && input[i] !== '\r' && input.slice(i, i + 3) !== '```') {
          language += input[i];
          i++;
        }
        if (i < input.length && (input[i] === '\n' || input[i] === '\r')) i++; // Skip optional second newline
      }

      // Read the code block content
      while (i < input.length && input.slice(i, i + 3) !== '```') {
        codeContent += input[i];
        i++;
      }

      // Skip the closing ```
      if (i < input.length && input.slice(i, i + 3) === '```') i += 3;

      (root.content as AstNode[]).push({
        type: 'pre',
        content: codeContent.trim(), // Trim to remove unwanted newlines
        language: hasNewline && language.trim() ? language.trim() : undefined,
      });
      continue;
    }

    // Handle inline code (`)
    if (char === '`' && input[i + 1] !== '`') {
      if (currentText) {
        (root.content as AstNode[]).push({ type: 'text', content: currentText });
        currentText = '';
      }

      i++; // Skip `
      let codeContent = '';
      while (i < input.length && input[i] !== '`') {
        codeContent += input[i];
        i++;
      }
      i++; // Skip closing `

      (root.content as AstNode[]).push({ type: 'code', content: codeContent });
      continue;
    }

    // Handle custom emoji [text](customEmoji:id)
    if (char === '[' && input.slice(i).includes('](customEmoji:')) {
      if (currentText) {
        (root.content as AstNode[]).push({ type: 'text', content: currentText });
        currentText = '';
      }

      i++; // Skip [
      let altText = '';
      while (i < input.length && input[i] !== ']') {
        altText += input[i];
        i++;
      }
      i += 2; // Skip ](
      let emojiId = '';
      i += 'customEmoji:'.length; // Skip customEmoji:
      while (i < input.length && input[i] !== ')') {
        emojiId += input[i];
        i++;
      }
      i++; // Skip )

      (root.content as AstNode[]).push({
        type: 'emoji',
        alt: altText,
        documentId: emojiId,
      });
      continue;
    }

    // Handle **, __, ~~, || with nesting
    const markers = ['**', '__', '~~', '||'];
    const currentI = i;
    const matchedMarker = markers.find((m) => input.slice(currentI, currentI + 2) === m);
    if (matchedMarker) {
      if (currentText) {
        (root.content as AstNode[]).push({ type: 'text', content: currentText });
        currentText = '';
      }

      i += 2; // Skip the opening marker
      let nestedContent = '';
      let nestingLevel = 1;

      // Collect content until matching closing marker, accounting for nesting
      while (i < input.length && nestingLevel > 0) {
        if (input.slice(i, i + 2) === matchedMarker) {
          nestingLevel--;
          if (nestingLevel > 0) {
            nestedContent += matchedMarker;
          }
          i += 2;
        } else if (
          markers.some((m) => m !== matchedMarker && input.slice(currentI, currentI + 2) === m)
        ) {
          nestedContent += input[i];
          i++;
        } else {
          nestedContent += input[i];
          i++;
        }
      }

      const typeMap: { [key: string]: string } = {
        '**': 'bold',
        __: 'italic',
        '~~': 'strikethrough',
        '||': 'spoiler',
      };

      // Recursively parse the nested content
      const nestedAst = generateAST(nestedContent);
      (root.content as AstNode[]).push({
        type: typeMap[matchedMarker],
        content: nestedAst.content,
      });
      continue;
    }

    // Handle <br> and <div> (replace with newline)
    if (char === '<' && (input.slice(i).startsWith('<br') || input.slice(i).startsWith('<div'))) {
      if (currentText) {
        (root.content as AstNode[]).push({ type: 'text', content: currentText });
        currentText = '';
      }

      if (input.slice(i).startsWith('<br')) {
        i += input.slice(i).indexOf('>') + 1;
        (root.content as AstNode[]).push({ type: 'text', content: '\n' });
      } else if (input.slice(i).startsWith('<div>')) {
        i += 5;
        (root.content as AstNode[]).push({ type: 'text', content: '\n' });
      } else if (input.slice(i).startsWith('</div>')) {
        i += 6;
        // Simply ignore </div>
      }
      continue;
    }

    // Regular text
    currentText += char;
    i++;
  }

  if (currentText) {
    (root.content as AstNode[]).push({ type: 'text', content: currentText });
  }

  return root;
}

function renderASTtoHTML(node: AstNode): string {
  if (node.type === 'root') {
    return (node.content as AstNode[]).map(renderASTtoHTML).join('');
  }

  if (node.type === 'text') {
    return node.content as string;
  }

  if (node.type === 'pre') {
    return node.language
      ? `<pre data-language='${node.language}'>${node.content}</pre>`
      : `<pre>${node.content}</pre>`;
  }

  if (node.type === 'code') {
    return `<code>${node.content}</code>`;
  }

  if (node.type === 'emoji') {
    return `<img alt='${node.alt}' data-document-id='${node.documentId}'>`;
  }

  if (node.type === 'bold') {
    return `<b>${(node.content as AstNode[]).map(renderASTtoHTML).join('')}</b>`;
  }

  if (node.type === 'italic') {
    return `<i>${(node.content as AstNode[]).map(renderASTtoHTML).join('')}</i>`;
  }

  if (node.type === 'strikethrough') {
    return `<s>${(node.content as AstNode[]).map(renderASTtoHTML).join('')}</s>`;
  }

  if (node.type === 'spoiler') {
    return `<span data-entity-type='spoiler'>${(node.content as AstNode[]).map(renderASTtoHTML).join('')}</span>`;
  }

  return '';
}

function buildLinksAST(input: string, startIndex = 0): AstNode {
  const root: AstNode = { type: 'root', content: [] };
  let currentText = '';
  let i = startIndex;

  while (i < input.length) {
    const char = input[i];

    // Handle links [text](link)
    if (char === '[' && input.slice(i).includes('](')) {
      if (currentText) {
        (root.content as AstNode[]).push({ type: 'text', content: currentText });
        currentText = '';
      }

      i++; // Skip [
      let linkText = '';
      while (i < input.length && input[i] !== ']') {
        linkText += input[i];
        i++;
      }
      i += 2; // Skip ](
      let linkHref = '';
      while (i < input.length && input[i] !== ')') {
        linkHref += input[i];
        i++;
      }
      i++; // Skip )

      // Determine the URL type
      const url = linkHref.includes('://')
        ? linkHref
        : linkHref.includes('@')
          ? `mailto:${linkHref}`
          : `https://${linkHref}`;

      // Add link node to AST
      (root.content as AstNode[]).push({
        type: 'link',
        content: linkText, // Store text as string, no nested parsing here
        href: url,
      });
      continue;
    }

    // Regular text
    currentText += char;
    i++;
  }

  if (currentText) {
    (root.content as AstNode[]).push({ type: 'text', content: currentText });
  }

  return root;
}

function renderLinksAST(node: AstNode): string {
  if (node.type === 'root') {
    return (node.content as AstNode[]).map(renderLinksAST).join('');
  }

  if (node.type === 'text') {
    return node.content as string;
  }

  if (node.type === 'link') {
    return `<a href='${node.href}'>${node.content}</a>`;
  }

  return '';
}

function parseMarkdownLinks(html: string): string {
  return renderLinksAST(buildLinksAST(html));
}

function parseMarkdown(html: string): string {
  return renderASTtoHTML(generateAST(html));
}

function getEntityDataFromNode(
  node: ChildNode,
  rawText: string,
  textIndex: number,
): { index: number; entity?: ApiMessageEntity } {
  const type = getEntityTypeFromNode(node);

  if (!type || !node.textContent) {
    return {
      index: textIndex,
      entity: undefined,
    };
  }

  const rawIndex = rawText.indexOf(node.textContent, textIndex);
  // In some cases, last text entity ends with a newline (which gets trimmed from `rawText`).
  // In this case, `rawIndex` would return `-1`, so we use `textIndex` instead.
  const index = rawIndex >= 0 ? rawIndex : textIndex;
  const offset = rawText.substring(0, index).length;
  const { length } = rawText.substring(index, index + node.textContent.length);

  if (type === ApiMessageEntityTypes.TextUrl) {
    return {
      index,
      entity: {
        type,
        offset,
        length,
        url: (node as HTMLAnchorElement).href,
      },
    };
  }
  if (type === ApiMessageEntityTypes.MentionName) {
    return {
      index,
      entity: {
        type,
        offset,
        length,
        userId: (node as HTMLAnchorElement).dataset.userId!,
      },
    };
  }

  if (type === ApiMessageEntityTypes.Pre) {
    return {
      index,
      entity: {
        type,
        offset,
        length,
        language: (node as HTMLPreElement).dataset.language,
      },
    };
  }

  if (type === ApiMessageEntityTypes.CustomEmoji) {
    return {
      index,
      entity: {
        type,
        offset,
        length,
        documentId: (node as HTMLImageElement).dataset.documentId!,
      },
    };
  }

  return {
    index,
    entity: {
      type,
      offset,
      length,
    },
  };
}

function getEntityTypeFromNode(node: ChildNode): ApiMessageEntityTypes | undefined {
  if (node instanceof HTMLElement && node.dataset.entityType) {
    return node.dataset.entityType as ApiMessageEntityTypes;
  }

  if (ENTITY_CLASS_BY_NODE_NAME[node.nodeName]) {
    return ENTITY_CLASS_BY_NODE_NAME[node.nodeName];
  }

  if (node.nodeName === 'A') {
    const anchor = node as HTMLAnchorElement;
    if (anchor.dataset.entityType === ApiMessageEntityTypes.MentionName) {
      return ApiMessageEntityTypes.MentionName;
    }
    if (anchor.dataset.entityType === ApiMessageEntityTypes.Url) {
      return ApiMessageEntityTypes.Url;
    }
    if (anchor.href.startsWith('mailto:')) {
      return ApiMessageEntityTypes.Email;
    }
    if (anchor.href.startsWith('tel:')) {
      return ApiMessageEntityTypes.Phone;
    }
    if (anchor.href !== anchor.textContent) {
      return ApiMessageEntityTypes.TextUrl;
    }

    return ApiMessageEntityTypes.Url;
  }

  if (node.nodeName === 'SPAN') {
    return (node as HTMLElement).dataset.entityType as any;
  }

  if (node.nodeName === 'IMG') {
    if ((node as HTMLImageElement).dataset.documentId) {
      return ApiMessageEntityTypes.CustomEmoji;
    }
  }

  return undefined;
}
