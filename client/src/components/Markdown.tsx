import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Markdown-renderer som bruker .md-stilene i design.css (Sporty-Plania).
// Gir ryddige overskrifter, lister, tabeller og sitater — nyttig for AI-innhold
// som øktbeskrivelser og vurderinger.
export function Markdown({ children }: { children: string; dark?: boolean }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
