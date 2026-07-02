import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const URL_PATTERN = /\b(?:https?:\/\/|mailto:|www\.)[^\s<>"']+/gi;
const MARKDOWN_PATTERNS = [
  /(^|\n)\s{0,3}#{1,6}\s+\S/,
  /(^|\n)\s{0,3}(?:[-*+]\s+|\d+[.)]\s+)\S/,
  /(^|\n)\s{0,3}>\s+\S/,
  /(^|\n)\s{0,3}```/,
  /(^|\n)\s{0,3}(?:---|\*\*\*|___)\s*($|\n)/,
  /(^|\n)\s*\|.+\|\s*($|\n)/,
  /!?\[[^\]\n]+\]\([^) \n]+(?:\s+"[^"\n]*")?\)/,
  /\[[^\]\n]+\]\[[^\]\n]*\]/,
  /(^|\n)\s{0,3}\[[^\]\n]+\]:\s+\S+/,
  /<(?:https?:\/\/|mailto:)[^>\s]+>/,
  /\*\*[^*\n][\s\S]*?\*\*/,
  /__[^_\n][\s\S]*?__/,
  /`[^`\n]+`/,
  /~~[^~\n]+~~/
];

function looksLikeMarkdown(text: string) {
  return MARKDOWN_PATTERNS.some((pattern) => pattern.test(text));
}

function normalizeLinkHref(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const href = /^www\./i.test(trimmed) ? `https://${trimmed}` : trimmed;

  try {
    const url = new URL(href);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:") {
      return url.href;
    }
  } catch {
    return null;
  }

  return null;
}

function trailingUrlText(value: string) {
  let linkText = value;
  let trailing = "";

  while (linkText) {
    const last = linkText[linkText.length - 1];
    const unmatchedClosingParen =
      last === ")" && (linkText.match(/\)/g) || []).length > (linkText.match(/\(/g) || []).length;

    if (!".,;:!?".includes(last) && !unmatchedClosingParen) {
      break;
    }

    trailing = `${last}${trailing}`;
    linkText = linkText.slice(0, -1);
  }

  return { linkText, trailing };
}

function ProfileLink({ href, children }: { href: string; children: ReactNode }) {
  const normalizedHref = normalizeLinkHref(href);

  if (!normalizedHref) {
    return <>{children}</>;
  }

  const newTabProps = normalizedHref.startsWith("mailto:")
    ? {}
    : { target: "_blank", rel: "noreferrer noopener" };

  return (
    <a className="browse-profile-link" href={normalizedHref} {...newTabProps}>
      {children}
    </a>
  );
}

function linkifyText(text: string) {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const matchText = match[0];
    const matchIndex = match.index ?? 0;
    const { linkText, trailing } = trailingUrlText(matchText);

    if (matchIndex > lastIndex) {
      nodes.push(text.slice(lastIndex, matchIndex));
    }

    nodes.push(
      <ProfileLink key={`link-${key}`} href={linkText}>
        {linkText}
      </ProfileLink>
    );

    if (trailing) {
      nodes.push(trailing);
    }

    lastIndex = matchIndex + matchText.length;
    key += 1;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

export default function ProfileText({ text }: { text: string }) {
  const content = text.replace(/\s+$/u, "");

  if (!content.trim()) {
    return null;
  }

  if (!looksLikeMarkdown(content)) {
    return <p className="browse-profile-desc">{linkifyText(content)}</p>;
  }

  return (
    <div className="browse-profile-desc browse-profile-desc-markdown">
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children }) {
            return <ProfileLink href={href || ""}>{children}</ProfileLink>;
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
