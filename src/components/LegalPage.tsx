import { Markdown } from "./Markdown";

const DOCS = import.meta.glob("../../legal/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

export const LEGAL_PAGES: { slug: string; title: string }[] = [
  { slug: "privacy", title: "Privacy Policy" },
  { slug: "terms", title: "Terms of Service" },
  { slug: "acceptable-use", title: "Acceptable Use" },
  { slug: "dpa", title: "Data Processing Agreement" },
  { slug: "subprocessors", title: "Subprocessors" },
  { slug: "cookies", title: "Cookie Notice" },
  { slug: "data-deletion", title: "Data Deletion" },
];

export function LegalPage({ slug }: { slug: string }) {
  const text = DOCS[`../../legal/${slug}.md`];
  return (
    <div className="legal">
      <nav className="legal-nav">
        <a href="/" className="brand">
          <span className="logo">◆</span> AdCanvas
        </a>
        {LEGAL_PAGES.map((p) => (
          <a key={p.slug} href={`/legal/${p.slug}`} className={p.slug === slug ? "on" : ""}>
            {p.title}
          </a>
        ))}
      </nav>
      <article className="legal-body">{text ? <Markdown text={text} /> : <p>Page not found.</p>}</article>
    </div>
  );
}
