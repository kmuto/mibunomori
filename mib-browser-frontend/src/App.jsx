import React, { useState, useEffect } from 'react';
// import './App.css'; // 既存のindex.cssで十分なので不要にすることも可能

// MIBNodeの型定義 (TypeScriptを使わない場合はコメントアウトしてもOK)
// /**
//  * @typedef {object} MIBNode
//  * @property {string} name
//  * @property {string} oid
//  * @property {string} [description]
//  * @property {MIBNode[]} [children]
//  */

// MIBツリーの個々のノードを表示するコンポーネント
function MIBTreeNode({ node }) {
  const [isExpanded, setIsExpanded] = useState(false); // ノードの展開状態

  const hasChildren = node.children && node.children.length > 0;

  const toggleExpand = () => {
    if (hasChildren) {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <li className={hasChildren ? 'has-children' : ''}>
      <span
        onClick={toggleExpand}
        className={isExpanded ? 'expanded' : ''}
        style={{ display: 'block', cursor: hasChildren ? 'pointer' : 'default' }} // クリック領域とカーソル
      >
        <span className="node-name">{node.name}</span>
        <span className="node-oid">({node.oid})</span>
        {node.description && (
          <span className="node-description">{node.description}</span>
        )}
      </span>
      {hasChildren && isExpanded && (
        <ul style={{ display: isExpanded ? 'block' : 'none' }}> {/* ここで直接 style を制御 */}
          {node.children.map((childNode) => (
            <MIBTreeNode key={childNode.oid} node={childNode} />
          ))}
        </ul>
      )}
    </li>
  );
}

// MIBツリー全体を表示するメインコンポーネント
function App() {
  const [mibData, setMibData] = useState([]); // MIBデータ
  const [loading, setLoading] = useState(true); // ロード中状態
  const [error, setError] = useState(null); // エラー状態

  useEffect(() => {
    const fetchMibData = async () => {
      try {
        // バックエンドのURLはGoアプリケーションが動作している場所に応じて調整してください
        const response = await fetch('http://localhost:5000/api/mib_tree');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setMibData(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchMibData();
  }, []); // [] を指定することで、コンポーネントのマウント時に一度だけ実行される

  if (loading) {
    return <main><div id="mib-tree-container" className="mib-tree"><p>MIBツリーをロード中...</p></div></main>;
  }

  if (error) {
    return <main><div id="mib-tree-container" className="mib-tree"><p className="error">MIBデータのロードに失敗しました: {error}</p></div></main>;
  }

  return (
    <>
      <header>
        <h1>SNMP MIB Browser (React)</h1>
      </header>
      <main>
        <div id="mib-tree-container" className="mib-tree">
          {mibData.length > 0 ? (
            <ul>
              {mibData.map((node) => (
                <MIBTreeNode key={node.oid} node={node} />
              ))}
            </ul>
          ) : (
            <p>表示するMIBノードがありません。</p>
          )}
        </div>
      </main>
      <footer>
        <p>&copy; 2025 SNMP MIB Browser</p>
      </footer>
    </>
  );
}

export default App;
