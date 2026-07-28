// src/components/ui/RichTextEditor.jsx
// ============================================================================
// RichTextEditor — ContentEditable dengan toolbar (Blogger-style)
// ============================================================================
// Features:
//   - Bold, Italic, Underline, Strikethrough
//   - Headings (H2, H3), Paragraph
//   - Lists (UL, OL)
//   - Text align (left, center, right)
//   - Text color picker
//   - Insert link
//   - Insert image (upload to Supabase Storage)
//   - Insert video (upload to Supabase Storage)
//   - Quote block
//   - Code block
//   - Horizontal rule
//   - Undo/Redo
// ============================================================================

import { useRef, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// ── Toolbar button ──
const ToolbarButton = ({ onClick, title, children, active }) => (
  <button
    type="button"
    onMouseDown={(e) => { e.preventDefault(); onClick(); }}
    title={title}
    className={`w-8 h-8 flex items-center justify-center rounded text-sm cursor-pointer border-none transition-colors ${
      active ? 'bg-eglux-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
    }`}
  >
    {children}
  </button>
);

const RichTextEditor = ({ value, onChange, placeholder = 'Tulis artikel di sini...' }) => {
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  // ── Execute document command (legacy but reliable for contentEditable) ──
  const exec = useCallback((command, val = null) => {
    document.execCommand(command, false, val);
    editorRef.current?.focus();
    // Trigger onChange
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  // ── Insert HTML at cursor ──
  const insertHTML = useCallback((html) => {
    document.execCommand('insertHTML', false, html);
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  }, [onChange]);

  // ── Upload image to Supabase Storage ──
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // reset input

    setUploading(true);
    try {
      const token = (await supabase.auth.getSession()).data?.session?.access_token;
      if (!token) return;

      const formData = new FormData();
      formData.append('file', file);

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/upload-blog-media`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      const result = await resp.json();

      if (result.success) {
        insertHTML(`<img src="${result.url}" alt="${file.name}" style="max-width:100%;border-radius:12px;margin:16px 0;" />`);
      }
    } catch (err) {
      console.error('[RichTextEditor] Image upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  // ── Upload video to Supabase Storage ──
  const handleVideoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setUploading(true);
    try {
      const token = (await supabase.auth.getSession()).data?.session?.access_token;
      if (!token) return;

      const formData = new FormData();
      formData.append('file', file);

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/upload-blog-media`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      const result = await resp.json();

      if (result.success) {
        insertHTML(`<video controls style="max-width:100%;border-radius:12px;margin:16px 0;"><source src="${result.url}" type="${file.type}"></video>`);
      }
    } catch (err) {
      console.error('[RichTextEditor] Video upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  // ── Insert link ──
  const handleInsertLink = () => {
    if (linkUrl.trim()) {
      const url = linkUrl.trim().startsWith('http') ? linkUrl.trim() : `https://${linkUrl.trim()}`;
      exec('createLink', url);
      setLinkUrl('');
      setShowLinkInput(false);
    }
  };

  // ── Handle input change ──
  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  // ── Set initial content ──
  const handleRef = (el) => {
    if (el && editorRef.current !== el) {
      editorRef.current = el;
      if (value && el.innerHTML !== value) {
        el.innerHTML = value;
      }
    }
  };

  return (
    <div className="border border-gray-300 rounded-md overflow-hidden">
      {/* === Toolbar === */}
      <div className="flex flex-wrap items-center gap-1 p-2 bg-gray-50 border-b border-gray-200">
        {/* Undo/Redo */}
        <ToolbarButton onClick={() => exec('undo')} title="Undo">↶</ToolbarButton>
        <ToolbarButton onClick={() => exec('redo')} title="Redo">↷</ToolbarButton>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Headings */}
        <select
          onChange={(e) => { exec('formatBlock', e.target.value); e.target.selectedIndex = 0; }}
          className="text-xs px-1.5 py-1 border border-gray-300 rounded cursor-pointer bg-white"
          defaultValue=""
        >
          <option value="" disabled>Style</option>
          <option value="p">Paragraph</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="blockquote">Quote</option>
          <option value="pre">Code Block</option>
        </select>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Font Size */}
        <select
          onChange={(e) => { exec('fontSize', e.target.value); e.target.selectedIndex = 0; }}
          className="text-xs px-1.5 py-1 border border-gray-300 rounded cursor-pointer bg-white"
          defaultValue=""
        >
          <option value="" disabled>Size</option>
          <option value="1">XS</option>
          <option value="2">S</option>
          <option value="3">M</option>
          <option value="4">L</option>
          <option value="5">XL</option>
          <option value="6">2XL</option>
          <option value="7">3XL</option>
        </select>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Bold/Italic/Underline/Strike */}
        <ToolbarButton onClick={() => exec('bold')} title="Bold"><strong>B</strong></ToolbarButton>
        <ToolbarButton onClick={() => exec('italic')} title="Italic"><em>I</em></ToolbarButton>
        <ToolbarButton onClick={() => exec('underline')} title="Underline"><u>U</u></ToolbarButton>
        <ToolbarButton onClick={() => exec('strikeThrough')} title="Strikethrough"><s>S</s></ToolbarButton>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Lists */}
        <ToolbarButton onClick={() => exec('insertUnorderedList')} title="Bullet List">•≡</ToolbarButton>
        <ToolbarButton onClick={() => exec('insertOrderedList')} title="Numbered List">1≡</ToolbarButton>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Alignment */}
        <ToolbarButton onClick={() => exec('justifyLeft')} title="Align Left">⬅️</ToolbarButton>
        <ToolbarButton onClick={() => exec('justifyCenter')} title="Align Center">↔️</ToolbarButton>
        <ToolbarButton onClick={() => exec('justifyRight')} title="Align Right">➡️</ToolbarButton>
        <ToolbarButton onClick={() => exec('justifyFull')} title="Justify">☰</ToolbarButton>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Text color */}
        <label className="w-8 h-8 flex items-center justify-center cursor-pointer rounded hover:bg-gray-100" title="Text Color">
          <input
            type="color"
            onChange={(e) => exec('foreColor', e.target.value)}
            className="w-5 h-5 cursor-pointer border-none p-0 rounded"
            style={{ background: 'transparent' }}
          />
        </label>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Link */}
        <ToolbarButton onClick={() => setShowLinkInput(!showLinkInput)} title="Insert Link">🔗</ToolbarButton>

        {/* Image upload */}
        <ToolbarButton onClick={() => fileInputRef.current?.click()} title="Insert Image">
          {uploading ? '⏳' : '🖼'}
        </ToolbarButton>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />

        {/* Video upload */}
        <ToolbarButton onClick={() => videoInputRef.current?.click()} title="Insert Video">
          {uploading ? '⏳' : '🎬'}
        </ToolbarButton>
        <input ref={videoInputRef} type="file" accept="video/*" onChange={handleVideoUpload} className="hidden" />

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* HR */}
        <ToolbarButton onClick={() => exec('insertHorizontalRule')} title="Horizontal Rule">―</ToolbarButton>

        {/* Clear formatting */}
        <ToolbarButton onClick={() => exec('removeFormat')} title="Clear Formatting">✕</ToolbarButton>
      </div>

      {/* === Link input (collapsible) === */}
      {showLinkInput && (
        <div className="flex items-center gap-2 p-2 bg-eglux-accent/30 border-b border-gray-200">
          <input
            type="text"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://..."
            className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded"
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleInsertLink())}
          />
          <button
            type="button"
            onClick={handleInsertLink}
            className="px-3 py-1 text-xs font-semibold text-white bg-eglux-primary rounded cursor-pointer border-none"
          >Insert</button>
          <button
            type="button"
            onClick={() => { setShowLinkInput(false); setLinkUrl(''); }}
            className="px-2 py-1 text-xs text-gray-500 cursor-pointer border-none bg-transparent"
          >✕</button>
        </div>
      )}

      {/* === Editor area (contentEditable) === */}
      <div
        ref={handleRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={handleInput}
        data-placeholder={placeholder}
        className="min-h-[300px] p-4 text-sm text-gray-700 outline-none focus:outline-none prose prose-sm max-w-none
          [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-eglux-primary [&_h2]:mt-4 [&_h2]:mb-2
          [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-eglux-primary [&_h3]:mt-3 [&_h3]:mb-2
          [&_p]:mb-3 [&_p]:leading-relaxed
          [&_img]:max-w-full [&_img]:rounded-lg [&_img]:my-3
          [&_video]:max-w-full [&_video]:rounded-lg [&_video]:my-3
          [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3
          [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3
          [&_blockquote]:border-l-4 [&_blockquote]:border-eglux-secondary [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-gray-600 [&_blockquote]:my-3
          [&_pre]:bg-gray-800 [&_pre]:text-green-400 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:text-xs [&_pre]:my-3
          [&_a]:text-eglux-secondary [&_a]:underline
          empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
      />
    </div>
  );
};

export default RichTextEditor;
