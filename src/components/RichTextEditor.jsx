'use client';
import { useEditor, EditorContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Underline } from '@tiptap/extension-underline';
import { Link } from '@tiptap/extension-link';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import { useEffect } from 'react';

// ── Toolbar button ────────────────────────────────────────────────────────────

function Btn({ onClick, active, disabled, title, children }) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded text-sm transition-colors select-none ${
        active
          ? 'bg-slate-700 text-white'
          : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
      } disabled:opacity-30 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="w-px h-5 bg-slate-200 mx-0.5 shrink-0" />;
}

// ── SVG icons ─────────────────────────────────────────────────────────────────

const Icons = {
  Bold:    () => <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M15.6 11.79A4.5 4.5 0 0012.75 4H6v16h7.5a4.75 4.75 0 003.35-8.21zM9 7h3.5a2 2 0 010 4H9V7zm4.5 10H9v-4h4.5a2.5 2.5 0 010 5z"/></svg>,
  Italic:  () => <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4v3h2.21l-3.42 10H6v3h8v-3h-2.21l3.42-10H18V4h-8z"/></svg>,
  Under:   () => <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z"/></svg>,
  Strike:  () => <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M10 19h4v-3h-4v3zM5 4v3h5v3h4V7h5V4H5zM3 14h18v-2H3v2z"/></svg>,
  H2:      () => <span className="font-bold text-xs leading-none">H2</span>,
  H3:      () => <span className="font-bold text-xs leading-none">H3</span>,
  BulletList: () => <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z"/></svg>,
  OrderedList: () => <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z"/></svg>,
  Code:    () => <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>,
  Quote:   () => <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z"/></svg>,
  Table:   () => <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M20 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 2v3H5V5h15zm-7 14h-3v-9h3v9zm-8 0V10h3v9H5zm14 0h-3V10h3v9z"/></svg>,
  Link:    () => <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>,
  Clear:   () => <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M3.27 5L2 6.27l6.97 6.97L6.5 19h3l1.57-3.66L16.73 21 18 19.73 3.27 5zM6 5v.18L8.82 8h2.4l-.72 1.68 2.1 2.1L14.21 8H20V5H6z"/></svg>,
};

// ── Main editor component ─────────────────────────────────────────────────────

export default function RichTextEditor({ value, onChange, placeholder, minHeight = 160 }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: { languageClassPrefix: 'language-' },
      }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'rich-editor-content focus:outline-none',
        style: `min-height:${minHeight}px; padding: 12px 14px;`,
      },
    },
  });

  // Sync external value changes (e.g. when modal opens with existing content)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value !== current) {
      editor.commands.setContent(value || '', false);
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!editor) return null;

  function insertTable() {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }

  function setLink() {
    const prev = editor.getAttributes('link').href;
    const url = window.prompt('URL', prev || 'https://');
    if (url === null) return;
    if (url === '') { editor.chain().focus().unsetLink().run(); return; }
    editor.chain().focus().setLink({ href: url }).run();
  }

  const e = editor;

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-400 focus-within:border-transparent">
      {/* Toolbar */}
      <div className="flex items-center flex-wrap gap-0.5 px-2 py-1.5 border-b border-slate-200 bg-slate-50">
        <Btn onClick={() => e.chain().focus().toggleBold().run()}        active={e.isActive('bold')}        title="Bold (Ctrl+B)"><Icons.Bold /></Btn>
        <Btn onClick={() => e.chain().focus().toggleItalic().run()}      active={e.isActive('italic')}      title="Italic (Ctrl+I)"><Icons.Italic /></Btn>
        <Btn onClick={() => e.chain().focus().toggleUnderline().run()}   active={e.isActive('underline')}   title="Underline (Ctrl+U)"><Icons.Under /></Btn>
        <Btn onClick={() => e.chain().focus().toggleStrike().run()}      active={e.isActive('strike')}      title="Strikethrough"><Icons.Strike /></Btn>
        <Divider />
        <Btn onClick={() => e.chain().focus().toggleHeading({ level: 2 }).run()} active={e.isActive('heading', { level: 2 })} title="Heading 2"><Icons.H2 /></Btn>
        <Btn onClick={() => e.chain().focus().toggleHeading({ level: 3 }).run()} active={e.isActive('heading', { level: 3 })} title="Heading 3"><Icons.H3 /></Btn>
        <Divider />
        <Btn onClick={() => e.chain().focus().toggleBulletList().run()}  active={e.isActive('bulletList')}  title="Bullet list"><Icons.BulletList /></Btn>
        <Btn onClick={() => e.chain().focus().toggleOrderedList().run()} active={e.isActive('orderedList')} title="Numbered list"><Icons.OrderedList /></Btn>
        <Divider />
        <Btn onClick={() => e.chain().focus().toggleBlockquote().run()}  active={e.isActive('blockquote')}  title="Blockquote"><Icons.Quote /></Btn>
        <Btn onClick={() => e.chain().focus().toggleCodeBlock().run()}   active={e.isActive('codeBlock')}   title="Code block"><Icons.Code /></Btn>
        <Divider />
        <Btn onClick={insertTable} title="Insert table (or paste from Google Sheets)"><Icons.Table /></Btn>
        <Btn onClick={setLink} active={e.isActive('link')} title="Insert/edit link"><Icons.Link /></Btn>
        <Divider />
        <Btn onClick={() => e.chain().focus().unsetAllMarks().clearNodes().run()} title="Clear formatting"><Icons.Clear /></Btn>
      </div>

      {/* Editor area */}
      <div className="bg-white relative">
        {!editor.getText().trim() && (
          <p className="absolute top-3 left-3.5 text-sm text-slate-400 pointer-events-none select-none z-10">
            {placeholder || 'Write content here, or paste from Google Docs or Microsoft Word to preserve formatting…'}
          </p>
        )}
        <EditorContent editor={editor} />
      </div>

      <style>{`
        .rich-editor-content h2 { font-size: 1.1em; font-weight: 700; margin: 0.8em 0 0.3em; color: #1e293b; }
        .rich-editor-content h3 { font-size: 1em; font-weight: 600; margin: 0.7em 0 0.25em; color: #334155; }
        .rich-editor-content p  { margin: 0.35em 0; line-height: 1.6; }
        .rich-editor-content ul, .rich-editor-content ol { padding-left: 1.4em; margin: 0.35em 0; }
        .rich-editor-content ul { list-style-type: disc; }
        .rich-editor-content ol { list-style-type: decimal; }
        .rich-editor-content li { margin: 0.15em 0; line-height: 1.6; }
        .rich-editor-content blockquote { border-left: 3px solid #cbd5e1; padding-left: 0.8em; margin: 0.5em 0; color: #64748b; font-style: italic; }
        .rich-editor-content pre  { background: #f1f5f9; border-radius: 6px; padding: 0.6em 0.8em; font-size: 0.8em; overflow-x: auto; margin: 0.5em 0; }
        .rich-editor-content code { background: #f1f5f9; padding: 0.15em 0.35em; border-radius: 3px; font-size: 0.82em; font-family: monospace; }
        .rich-editor-content pre code { background: none; padding: 0; }
        .rich-editor-content a { color: #2563eb; text-decoration: underline; }
        .rich-editor-content strong { font-weight: 700; }
        .rich-editor-content em { font-style: italic; }
        .rich-editor-content u  { text-decoration: underline; }
        .rich-editor-content s  { text-decoration: line-through; }
        /* Table styles — handles pasted Google Sheets content */
        .rich-editor-content table { border-collapse: collapse; width: 100%; margin: 0.6em 0; font-size: 0.85em; }
        .rich-editor-content th, .rich-editor-content td { border: 1px solid #cbd5e1; padding: 5px 8px; text-align: left; vertical-align: top; }
        .rich-editor-content th { background: #f8fafc; font-weight: 600; color: #334155; }
        .rich-editor-content tr:nth-child(even) td { background: #f8fafc; }
        .rich-editor-content .selectedCell:after { background: rgba(200,220,255,0.4); content: ""; left: 0; right: 0; top: 0; bottom: 0; pointer-events: none; position: absolute; z-index: 2; }
        .rich-editor-content td, .rich-editor-content th { position: relative; }
      `}</style>
    </div>
  );
}

// ── Read-only HTML renderer (for display in cards) ────────────────────────────

export function RichContent({ html, className = '' }) {
  if (!html) return null;
  // Detect plain text (no HTML tags) — render with whitespace preserved
  const isPlain = !/<[a-z][\s\S]*>/i.test(html);
  if (isPlain) {
    return <span className={`whitespace-pre-wrap ${className}`}>{html}</span>;
  }
  return (
    <>
      <div
        className={`rich-content ${className}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <style>{`
        .rich-content { font-size: 0.875rem; line-height: 1.6; color: #475569; }
        .rich-content h2 { font-size: 1em; font-weight: 700; margin: 0.6em 0 0.2em; color: #1e293b; }
        .rich-content h3 { font-size: 0.95em; font-weight: 600; margin: 0.5em 0 0.2em; color: #334155; }
        .rich-content p  { margin: 0.3em 0; }
        .rich-content p:first-child { margin-top: 0; }
        .rich-content ul, .rich-content ol { padding-left: 1.4em; margin: 0.3em 0; }
        .rich-content ul { list-style-type: disc; }
        .rich-content ol { list-style-type: decimal; }
        .rich-content li { margin: 0.1em 0; }
        .rich-content blockquote { border-left: 3px solid #cbd5e1; padding-left: 0.7em; margin: 0.4em 0; color: #64748b; font-style: italic; }
        .rich-content pre  { background: #f1f5f9; border-radius: 5px; padding: 0.5em 0.7em; font-size: 0.8em; overflow-x: auto; margin: 0.4em 0; }
        .rich-content code { background: #f1f5f9; padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.82em; font-family: monospace; }
        .rich-content pre code { background: none; padding: 0; }
        .rich-content a  { color: #2563eb; text-decoration: underline; }
        .rich-content strong { font-weight: 700; color: #1e293b; }
        .rich-content em { font-style: italic; }
        .rich-content table { border-collapse: collapse; width: 100%; margin: 0.5em 0; font-size: 0.85em; }
        .rich-content th, .rich-content td { border: 1px solid #e2e8f0; padding: 4px 8px; text-align: left; vertical-align: top; }
        .rich-content th { background: #f8fafc; font-weight: 600; color: #334155; }
        .rich-content tr:nth-child(even) td { background: #f8fafc; }
      `}</style>
    </>
  );
}
