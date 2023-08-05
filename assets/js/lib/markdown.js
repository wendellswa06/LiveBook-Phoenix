import morphdom from "morphdom";

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";
import rehypeParse from "rehype-parse";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";

import "katex/contrib/copy-tex";

import { visit } from "unist-util-visit";
import { toText } from "hast-util-to-text";
import { removePosition } from "unist-util-remove-position";

import { highlight } from "../hooks/cell_editor/live_editor/monaco";
import { renderMermaid } from "./markdown/mermaid";
import { escapeHtml } from "../lib/utils";

/**
 * Renders markdown content in the given container.
 */
class Markdown {
  constructor(
    container,
    content,
    { baseUrl = null, emptyText = "", allowedUriSchemes = [] } = {}
  ) {
    this.container = container;
    this.content = content;
    this.baseUrl = baseUrl;
    this.emptyText = emptyText;
    this.allowedUriSchemes = allowedUriSchemes;

    this._render();
  }

  setContent(content) {
    this.content = content;
    this._render();
  }

  _render() {
    this._getHtml().then((html) => {
      // Wrap the HTML in another element, so that we
      // can use morphdom's childrenOnly option
      const wrappedHtml = `<div>${html}</div>`;
      morphdom(this.container, wrappedHtml, { childrenOnly: true });
    });
  }

  _getHtml() {
    return (
      unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkMath)
        .use(remarkPrepareMermaid)
        .use(remarkSyntaxHiglight, { highlight })
        // We keep the HTML nodes, parse with rehype-raw and then sanitize
        .use(remarkRehype, { allowDangerousHtml: true })
        .use(rehypeRaw)
        .use(rehypeExpandUrls, { baseUrl: this.baseUrl })
        .use(rehypeSanitize, sanitizeSchema(this.allowedUriSchemes))
        .use(rehypeKatex)
        .use(rehypeMermaid)
        .use(rehypeExternalLinks, { baseUrl: this.baseUrl })
        .use(rehypeStringify)
        .process(this.content)
        .then((file) => String(file))
        .catch((error) => {
          console.error(`Failed to render markdown, reason: ${error.message}`);
        })
        .then((html) => {
          if (html) {
            return html;
          } else {
            return `
              <div class="text-gray-300">
                ${this.emptyText}
              </div>
            `;
          }
        })
    );
  }
}

export default Markdown;

// Plugins

function sanitizeSchema(allowedUriSchemes) {
  // Allow class and style attributes on tags for syntax highlighting,
  // remarkMath tags, or user-written styles

  return {
    ...defaultSchema,
    attributes: {
      ...defaultSchema.attributes,
      "*": [...(defaultSchema.attributes["*"] || []), "className", "style"],
    },
    protocols: {
      ...defaultSchema.protocols,
      href: [...defaultSchema.protocols.href, ...allowedUriSchemes],
    },
  };
}

// Highlights code snippets with the given function (possibly asynchronous)
function remarkSyntaxHiglight(options) {
  return (ast) => {
    const promises = [];

    visit(ast, "code", (node) => {
      if (node.lang) {
        function updateNode(html) {
          node.type = "html";
          node.value = `<pre><code>${html}</code></pre>`;
        }

        const result = options.highlight(node.value, node.lang);

        if (result && typeof result.then === "function") {
          const promise = Promise.resolve(result).then(updateNode);
          promises.push(promise);
        } else {
          updateNode(result);
        }
      }
    });

    return Promise.all(promises).then(() => null);
  };
}

// Expands relative URLs against the given base url
// and deals with ".." in URLs
function rehypeExpandUrls(options) {
  return (ast) => {
    if (options.baseUrl) {
      visit(ast, "element", (node) => {
        if (node.tagName === "a" && node.properties) {
          const url = node.properties.href;

          if (
            url &&
            !isAbsoluteUrl(url) &&
            !isInternalUrl(url) &&
            !isPageAnchor(url)
          ) {
            node.properties.href = urlAppend(options.baseUrl, url);
          }
        }

        if (node.tagName === "img" && node.properties) {
          const url = node.properties.src;

          if (url && !isAbsoluteUrl(url) && !isInternalUrl(url)) {
            node.properties.src = urlAppend(options.baseUrl, url);
          }
        }
      });
    }

    // Browser normalizes URLs with ".." so we use a "__parent__"
    // modifier instead and handle it on the server
    visit(ast, "element", (node) => {
      if (node.tagName === "a" && node.properties && node.properties.href) {
        node.properties.href = node.properties.href
          .split("/")
          .map((part) => (part === ".." ? "__parent__" : part))
          .join("/");
      }
    });
  };
}

const parseHtml = unified().use(rehypeParse, { fragment: true });

function remarkPrepareMermaid(options) {
  return (ast) => {
    visit(ast, "code", (node, index, parent) => {
      if (node.lang === "mermaid") {
        node.type = "html";
        node.value = `
          <div class="mermaid">${escapeHtml(node.value)}</div>
        `;
      }
    });
  };
}

function rehypeMermaid(options) {
  return (ast) => {
    const promises = [];

    visit(ast, "element", (element) => {
      const classes =
        element.properties && Array.isArray(element.properties.className)
          ? element.properties.className
          : [];

      if (classes.includes("mermaid")) {
        function updateNode(html) {
          element.children = removePosition(
            parseHtml.parse(html),
            true
          ).children;
        }

        const value = toText(element, { whitespace: "pre" });
        const promise = renderMermaid(value).then(updateNode);
        promises.push(promise);
      }
    });

    return Promise.all(promises).then(() => null);
  };
}

// Modifies external links, so that they open in a new tab
function rehypeExternalLinks(options) {
  return (ast) => {
    visit(ast, "element", (node) => {
      if (node.properties && node.properties.href) {
        const url = node.properties.href;

        if (isInternalUrl(url)) {
          node.properties["data-phx-link"] =
            options.baseUrl && url.startsWith(options.baseUrl)
              ? "patch"
              : "redirect";
          node.properties["data-phx-link-state"] = "push";
        } else if (isAbsoluteUrl(url)) {
          node.properties.target = "_blank";
          node.properties.rel = "noreferrer noopener";
        }
      }
    });
  };
}

function isAbsoluteUrl(url) {
  return /^(?:[a-z]+:)?\/\//i.test(url);
}

function isPageAnchor(url) {
  return url.startsWith("#");
}

function isInternalUrl(url) {
  return url.startsWith("/") || url.startsWith(window.location.origin);
}

function urlAppend(url, relativePath) {
  return url.replace(/\/$/, "") + "/" + relativePath;
}
