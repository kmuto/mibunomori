import React, { useState, useEffect, useRef, useCallback } from 'react';
// import './App.css'; // 必要であれば独自のCSSファイルをインポート。今回はindex.cssで十分。

// MIBNodeの型定義 (TypeScriptを使わない場合はコメントアウトしてもOK)
/**
 * @typedef {object} MIBNode
 * @property {string} name
 * @property {string} oid
 * @property {string} [description]
 * @property {MIBNode[]} [children]
 */

// MIBツリーの個々のノードを表示するコンポーネント
// React.memo を適用して、プロップが変更されない限り再レンダリングをスキップさせ、パフォーマンスを最適化
const MIBTreeNode = React.memo(function MIBTreeNode({ node, expandedOids, toggleNodeExpansion, searchTargetOid }) {
  // このノードが展開されているかどうかを一元管理された状態から取得
  const isExpanded = expandedOids.has(node.oid);
  // このノードのDOM要素への参照
  const nodeRef = useRef(null);

  // 子ノードが存在するかどうか
  const hasChildren = node.children && node.children.length > 0;
  // このノードが検索ターゲットのOIDと完全に一致するかどうか
  const isThisNodeSearchTarget = searchTargetOid === node.oid;

  // 展開/折りたたみトグル関数。親から渡された関数を呼び出す
  const handleClick = useCallback(() => {
    if (hasChildren) {
      toggleNodeExpansion(node.oid); // 親の展開状態を更新
    }
  }, [hasChildren, node.oid, toggleNodeExpansion]);

  // このノードが検索ターゲットになった場合の処理
  useEffect(() => {
    if (isThisNodeSearchTarget && nodeRef.current) {
      // ノードをハイライト表示
      nodeRef.current.classList.add('highlighted-node');
      // ノードがビューポート内に表示されるようにスクロール
      nodeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // 2秒後にハイライトを消すタイマーを設定
      const timer = setTimeout(() => {
        if (nodeRef.current) {
          nodeRef.current.classList.remove('highlighted-node');
        }
      }, 2000); 
      // コンポーネントがアンマウントされるか、isThisNodeSearchTarget が変更されたらタイマーをクリア
      return () => clearTimeout(timer);
    }
  }, [isThisNodeSearchTarget]); // isThisNodeSearchTarget が変更されたら実行

  return (
    // li 要素に has-children クラスを適用
    <li className={hasChildren ? 'has-children' : ''}>
      {/* クリック可能な要素を span で囲む。アイコンの表示と回転もこの span で制御 */}
      <span
        onClick={handleClick} // クリックハンドラを変更
        // アイコン回転用クラスと、検索ターゲット時のハイライトクラスを適用
        className={`${isExpanded ? 'expanded' : ''} ${isThisNodeSearchTarget ? 'highlighted-node' : ''}`}
        // クリック領域を確保するためブロック要素に、子ノードがある場合はカーソルをポインターに
        style={{ display: 'block', cursor: hasChildren ? 'pointer' : 'default' }}
        ref={nodeRef} // DOM要素の参照を設定
      >
        <span className="node-name">{node.name}</span>
        <span className="node-oid">({node.oid})</span>
        {node.description && (
          <span className="node-description">{node.description}</span>
        )}
      </span>
      
      {/* 子ノードがある場合、かつ展開されている場合のみ子ノードの ul をレンダリングする */}
      {hasChildren && isExpanded && ( // ここは前回の修正のまま
        <ul>
          {node.children.map((childNode) => (
            <MIBTreeNode 
              key={childNode.oid} 
              node={childNode} 
              expandedOids={expandedOids} // 展開状態を子に渡す
              toggleNodeExpansion={toggleNodeExpansion} // 展開トグル関数を子に渡す
              searchTargetOid={searchTargetOid} // 検索ターゲットOIDを子に渡す
            />
          ))}
        </ul>
      )}
    </li>
  );
});


// MIBツリー全体を表示するメインアプリケーションコンポーネント
function App() {
  const [mibData, setMibData] = useState([]); // MIBデータ
  const [loading, setLoading] = useState(true); // ロード中状態
  const [error, setError] = useState(null); // エラー状態
  const [searchQuery, setSearchQuery] = useState(''); // 検索クエリの状態
  const [searchTargetOid, setSearchTargetOid] = useState(null); // 検索で見つかったターゲットノードのOID

  // 展開されているOIDのセットを一元管理
  // Setオブジェクトは参照が変更されない限りReactは再レンダリングしないので、効率的
  const [expandedOids, setExpandedOids] = useState(new Set()); 

  // MIBデータをフラットなリストとして保持（検索効率化のため）
  const flatMibNodes = useRef([]);

  // ノードの展開状態をトグルする関数
  // useCallbackでメモ化し、子コンポーネントへの不要な再生成を防ぐ
  const toggleNodeExpansion = useCallback((oid) => {
    setExpandedOids(prevExpandedOids => {
      const newExpandedOids = new Set(prevExpandedOids); // 新しいSetを作成して変更
      if (newExpandedOids.has(oid)) {
        newExpandedOids.delete(oid); // 展開済みなら閉じる
      } else {
        newExpandedOids.add(oid); // 閉じていれば展開
      }
      return newExpandedOids;
    });
  }, []);

  // コンポーネントマウント時にバックエンドからMIBデータを取得
  useEffect(() => {
    const fetchMibData = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/mib_tree');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setMibData(data);
        
        // MIBデータをフラット化して検索用に保持するヘルパー関数
        const flatten = (nodes) => {
            let result = [];
            nodes.forEach(node => {
                result.push(node);
                if (node.children) {
                    result = result.concat(flatten(node.children));
                }
            });
            return result;
        };
        // 取得したMIBデータをフラット化して useRef に保存
        flatMibNodes.current = flatten(data);

      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchMibData();
  }, []); // 空の依存配列は、コンポーネントのマウント時に一度だけ実行されることを意味する

  // OID検索ハンドラ
  const handleSearch = () => {
    // 検索クエリが空の場合、検索ターゲットをクリアし、全ての展開状態をリセット
    if (!searchQuery) {
        setSearchTargetOid(null);
        setExpandedOids(new Set()); // 全て閉じる
        return;
    }

    // フラットなリストから前方一致で検索
    const foundNode = flatMibNodes.current.find(node => node.oid.startsWith(searchQuery));

    if (foundNode) {
        setSearchTargetOid(foundNode.oid); // 検索ターゲットOIDを設定
        
        // ターゲットノードまでのパスを全て展開するための新しいSetを作成
        setExpandedOids(prevExpandedOids => {
            const newExpandedOids = new Set(prevExpandedOids); // 既存の展開状態をコピー
            const oidParts = foundNode.oid.split('.');
            let currentOidPath = '';
            for (let i = 0; i < oidParts.length; i++) {
                currentOidPath = (currentOidPath ? currentOidPath + '.' : '') + oidParts[i];
                newExpandedOids.add(currentOidPath); // パス上のOIDを展開状態に追加
            }
            return newExpandedOids;
        });

    } else {
        alert('指定されたOIDのノードは見つかりませんでした。');
        setSearchTargetOid(null); // ターゲットをクリア
    }
  };

  // 検索ボックスでEnterキーが押された場合のハンドラ
  const handleKeyPress = (event) => {
    if (event.key === 'Enter') {
      handleSearch();
    }
  };

  // ロード中の表示
  if (loading) {
    return (
      <main>
        <div id="mib-tree-container" className="mib-tree">
          <p>MIBツリーをロード中...</p>
        </div>
      </main>
    );
  }

  // エラー発生時の表示
  if (error) {
    return (
      <main>
        <div id="mib-tree-container" className="mib-tree">
          <p className="error">MIBデータのロードに失敗しました: {error}</p>
        </div>
      </main>
    );
  }

  // メインのレンダリング
  return (
    <>
      <header>
        <h1>SNMP MIB Browser (React)</h1>
      </header>
      <div className="search-bar-fixed">
        <input
          type="text"
          placeholder="OIDを入力して検索 (例: 1.3.6.1.2.1)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyPress={handleKeyPress}
          // style={{ width: '300px', padding: '8px', marginRight: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
          // スタイルはCSSクラスに移動
        />
        <button 
          onClick={handleSearch}
          // style={{ padding: '8px 15px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          // スタイルはCSSクラスに移動
        >
          検索
        </button>
      </div>
      <main>
        {/* MIBツリーコンテナ */}
        <div id="mib-tree-container" className="mib-tree">
          {mibData.length > 0 ? (
            <ul>
              {mibData.map((node) => (
                <MIBTreeNode 
                  key={node.oid} 
                  node={node} 
                  expandedOids={expandedOids} // 展開状態のSetを渡す
                  toggleNodeExpansion={toggleNodeExpansion} // 展開トグル関数を渡す
                  searchTargetOid={searchTargetOid} // 検索ターゲットOIDを渡す
                />
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