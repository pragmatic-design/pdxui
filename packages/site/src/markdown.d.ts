// Types for the `*.md` imports the markdown plugin transforms (see src/lib/markdown/vite-markdown.ts).
declare module '*.md' {
    interface DocHeading { depth: number; text: string; id: string; }
    const doc: {
        frontmatter: Record<string, string | number>;
        html: string;
        headings: DocHeading[];
        slug: string;
    };
    export default doc;
}
