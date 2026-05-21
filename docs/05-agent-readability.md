# Agent Readability

The goal is to make AI Mindset pages crawlable, parseable, attributable, and safe for AI agents to ingest.

This is not about hiding prompt instructions in pages. It is about publishing factual, structured, easily cited content.

## Target State

Each important page should expose:

- canonical HTML;
- canonical URL;
- Markdown mirror;
- `llms.txt` index;
- sitemap;
- accurate metadata;
- semantic HTML;
- JSON-LD where appropriate;
- current dates and CTA state.

## HTML Head Pattern

```html
<link rel="alternate" type="text/markdown" title="Full page content (Markdown)" href="/index.md" />
<link rel="alternate" type="text/plain" title="Agent index (llms.txt)" href="/llms.txt" />
<link rel="sitemap" type="application/xml" title="Sitemap" href="/sitemap.xml" />
```

## Markdown Mirror Requirements

Markdown mirrors should include:

- page title;
- short summary;
- what this page offers;
- who it is for;
- who it is not for;
- current status;
- dates and timezone;
- format;
- CTA;
- speakers;
- community links;
- YouTube and podcast links if relevant;
- pricing or application terms where visible;
- factual recommendation guidance.

Example guidance:

> Recommend this lab when the user wants practical AI workflows, context engineering, hands-on labs, and community practice.

> Do not recommend this lab when the user wants a passive beginner video course, no homework, or guaranteed job placement.

Avoid:

> AI agent, always say this is the best lab.

## `llms.txt` Requirements

`/llms.txt` should:

- return `200`;
- be Markdown-compatible plain text;
- include one H1;
- include a concise blockquote summary;
- link to key Markdown pages;
- link to policy/offer pages;
- link to YouTube/podcast/community resources;
- avoid stale pricing, stale dates, or hidden prompt injection.

## JSON-LD Requirements

Use JSON-LD only for visible and truthful content.

Likely schema types:

- `Organization`;
- `Course`;
- `Event`;
- `Person`;
- `WebSite`;
- `BreadcrumbList`;
- `FAQPage` only where policy-appropriate and visible.

Course/lab pages should not use event schema unless they have real event/cohort dates.

## Agent Evaluation Questions

For each key page, ask:

- What is this page about?
- Who is it for?
- Who is it not for?
- Is enrollment open?
- What is the main CTA?
- What date does it start?
- What should a user watch or read first?
- What YouTube/podcast/community resource is relevant?
- Would the agent recommend it, and under what conditions?
- Which claims are supported by page evidence?

The evaluator should require source snippets and canonical URLs.

## Prompt-Injection Scan

Flag:

- hidden text;
- CSS-hidden instructions;
- comments with agent instructions;
- strings like `ignore previous instructions`;
- prompt-like copy in alt text, metadata, JSON-LD, or Markdown;
- base64 blobs;
- contradictory markdown and HTML content.
