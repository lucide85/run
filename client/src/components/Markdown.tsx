import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Liten markdown-renderer med Tailwind-stiler (vi har ikke typography-plugin,
// så vi stiler hvert element manuelt for et ryddig, lyst uttrykk).
export function Markdown({ children, dark = false }: { children: string; dark?: boolean }) {
  const text = dark ? "text-white" : "text-slate-700";
  const strong = dark ? "text-white" : "text-slate-900";
  return (
    <div className={`text-sm leading-relaxed ${text}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className={`font-semibold ${strong}`}>{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="mb-2 ml-1 list-disc space-y-1 pl-4 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 ml-1 list-decimal space-y-1 pl-4 last:mb-0">{children}</ol>,
          li: ({ children }) => <li className="pl-1">{children}</li>,
          h1: ({ children }) => <h3 className="mb-1 mt-2 font-semibold">{children}</h3>,
          h2: ({ children }) => <h3 className="mb-1 mt-2 font-semibold">{children}</h3>,
          h3: ({ children }) => <h3 className="mb-1 mt-2 font-semibold">{children}</h3>,
          code: ({ children }) => (
            <code className={`rounded px-1 py-0.5 text-xs ${dark ? "bg-white/20" : "bg-slate-100"}`}>{children}</code>
          ),
          a: ({ children, href }) => (
            <a href={href} className="text-brand-600 underline" target="_blank" rel="noreferrer">
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
