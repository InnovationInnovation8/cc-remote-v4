import { useState, useEffect } from 'react';
import { getApiBase, getAuthHeaders } from '../utils/api';

export default function FileBrowser({ token, onClose }) {
  const [items, setItems] = useState([]);
  const [currentPath, setCurrentPath] = useState('');
  const [parentPath, setParentPath] = useState('');
  const [loading, setLoading] = useState(true);
  const [fileContent, setFileContent] = useState(null);
  const [viewingFile, setViewingFile] = useState('');

  const browse = async (dir) => {
    setLoading(true);
    setFileContent(null);
    try {
      const base = getApiBase();
      const url = dir ? `${base}/files?path=${encodeURIComponent(dir)}` : `${base}/files`;
      const res = await fetch(url, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items);
        setCurrentPath(data.path);
        setParentPath(data.parent);
      }
    } catch (e) {}
    setLoading(false);
  };

  const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
  const [imagePreview, setImagePreview] = useState(null);

  const openFile = (filePath) => {
    const ext = filePath.split('.').pop().toLowerCase();
    if (IMAGE_EXTS.includes('.' + ext)) {
      setImagePreview(filePath);
      setFileContent(null);
    } else {
      readFile(filePath);
    }
  };

  const readFile = async (filePath) => {
    try {
      const res = await fetch(`${getApiBase()}/files/read?path=${encodeURIComponent(filePath)}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setFileContent(data.content);
        setViewingFile(filePath.split(/[/\\]/).pop());
      } else {
        const err = await res.json();
        alert(err.error || 'ファイルを開けません');
      }
    } catch (e) {}
  };

  useEffect(() => { browse(); }, []);

  if (imagePreview !== null) {
    return (
      <div className="flex flex-col h-full bg-cyber-bg">
        <div className="bg-gradient-to-r from-cyber-800 to-cyber-900 border-b-2 border-navi px-3 py-2 flex items-center flex-shrink-0">
          <button onClick={() => setImagePreview(null)} className="text-navi-glow mr-3 text-lg">←</button>
          <span className="font-mono text-txt-secondary text-xs truncate">{imagePreview.split(/[/\\]/).pop()}</span>
        </div>
        <div className="flex-1 overflow-auto flex items-center justify-center p-3">
          <img
            src={'/api/files/image?path=' + encodeURIComponent(imagePreview)}
            alt={imagePreview.split(/[/\\]/).pop()}
            className="max-w-full max-h-full object-contain"
          />
        </div>
      </div>
    );
  }

  if (fileContent !== null) {
    return (
      <div className="flex flex-col h-full bg-cyber-bg">
        <div className="bg-gradient-to-r from-cyber-800 to-cyber-900 border-b-2 border-navi px-3 py-2 flex items-center flex-shrink-0">
          <button onClick={() => setFileContent(null)} className="text-navi-glow mr-3 text-lg">←</button>
          <span className="font-mono text-txt-secondary text-xs truncate">{viewingFile}</span>
        </div>
        <pre className="flex-1 overflow-auto p-3 text-xs font-mono text-txt-secondary whitespace-pre-wrap break-all">
          {fileContent}
        </pre>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-cyber-bg">
      <div className="bg-gradient-to-r from-cyber-800 to-cyber-900 border-b-2 border-navi px-3 py-2 flex items-center flex-shrink-0">
        <button onClick={onClose} className="text-navi-glow mr-3 text-lg">←</button>
        <span className="font-pixel text-navi-glow text-[10px] tracking-wider">FILES</span>
      </div>

      {/* Current path */}
      <div className="bg-cyber-900 px-3 py-1.5 border-b border-navi/20 flex items-center gap-2 flex-shrink-0">
        {parentPath !== currentPath && (
          <button onClick={() => browse(parentPath)} className="text-navi text-sm">↑</button>
        )}
        <div className="text-[10px] font-mono text-txt-muted truncate">{currentPath}</div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-center text-txt-muted font-mono text-xs py-8 animate-pulse">LOADING...</div>
        ) : items.length === 0 ? (
          <div className="text-center text-txt-muted font-mono text-xs py-8">// EMPTY</div>
        ) : (
          items.map((item, i) => (
            <button
              key={i}
              onClick={() => item.isDir ? browse(item.path) : openFile(item.path)}
              className="w-full text-left px-3 py-2 border-b border-cyber-800 hover:bg-navi/5 flex items-center gap-2 transition-colors"
            >
              <span className={`text-sm flex-shrink-0 ${item.isDir ? 'text-exe-yellow' : 'text-txt-muted'}`}>
                {item.isDir ? '>' : ' '}
              </span>
              <span className={`text-xs font-mono truncate ${item.isDir ? 'text-txt-secondary' : 'text-txt-muted'}`}>
                {item.name}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
