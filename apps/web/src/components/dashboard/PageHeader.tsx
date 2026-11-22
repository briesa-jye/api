export function PageHeader({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-dashed pb-6">
      <div>
        <h1 className="text-2xl tracking-tighter md:text-3xl">{title}</h1>
        {description && <p className="text-muted-foreground mt-2 max-w-xl text-sm leading-relaxed">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <th scope="col" className={`text-muted-foreground px-3 py-2.5 text-left font-mono text-[0.625rem] font-normal tracking-wider uppercase ${className}`}>{children}</th>;
}
export function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-3 align-top text-sm ${className}`}>{children}</td>;
}
