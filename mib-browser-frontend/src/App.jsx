import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

// MIBNode Type Definition
/**
 * @typedef {object} MIBNode
 * @property {string} name
 * @property {string} oid
 * @property {string} [description]
 * @property {MIBNode[]} [children]
 */

// NodeDetailsResponse Type Definition
/**
 * @typedef {object} NodeDetailsResponse
 * @property {string} name
 * @property {string} oid
 * @property {string} [description]
 * @property {string} [nodeType]
 * @property {string} [decl]
 * @property {string} [format]
 * @property {string} [reference]
 * @property {string} [status]
 * @property {string} [units]
 * @property {Array<{value: number, label: string}>} [enumValues]
 * @property {Array<{min: number, max: number}>} [ranges]
 */

// MIBツリーの個々のノードを表示するコンポーネント
// React.memo を適用して、プロップが変更されない限り再レンダリングをスキップさせ、パフォーマンスを最適化
const MIBTreeNode = React.memo(function MIBTreeNode({ node, expandedOids, toggleNodeExpansion, searchTargetOid, onNodeClickForDetails }) {
  // このノードが展開されているかどうかを一元管理された状態から取得
  const isExpanded = expandedOids.has(node.oid);
  // このノードのDOM要素への参照
  const nodeRef = useRef(null);

  // 子ノードが存在するかどうか
  const hasChildren = node.children && node.children.length > 0;
  // このノードが検索ターゲットのOIDと完全に一致するかどうか
  const isThisNodeSearchTarget = searchTargetOid === node.oid;

  // 展開/折りたたみトグル関数。親から渡された関数を呼び出す
  // このハンドラはノードの主要なクリック領域（アイコン、名前）にアタッチされます。
  const handleToggleExpand = useCallback(() => {
    if (hasChildren) {
      toggleNodeExpansion(node.oid);
    }
  }, [hasChildren, node.oid, toggleNodeExpansion]);

  // 詳細ポップアップ表示のためのハンドラ。OID部分にのみアタッチされます。
  // event.stopPropagation() を呼び出して、親要素（展開/折りたたみ用span）へのイベント伝播を防ぎます。
  const handleShowDetails = useCallback((event) => {
    event.stopPropagation(); // 親の展開/折りたたみイベントが発火するのを防ぐ
    onNodeClickForDetails(node.oid);
  }, [node.oid, onNodeClickForDetails]);

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
      }, 5000);
      // コンポーネントがアンマウントされるか、isThisNodeSearchTarget が変更されたらタイマーをクリア
      return () => clearTimeout(timer);
    }
  }, [isThisNodeSearchTarget]); // isThisNodeSearchTarget が変更されたら実行

  return (
    // li 要素に has-children クラスを適用
    <li className={hasChildren ? 'has-children' : ''}>
      {/* クリック可能な要素を span で囲む。アイコンの表示と回転もこの span で制御 */}
      <span
        onClick={handleToggleExpand} // 展開/折りたたみのみ
        // アイコン回転用クラスと、検索ターゲット時のハイライトクラスを適用
        className={`${isExpanded ? 'expanded' : ''} ${isThisNodeSearchTarget ? 'highlighted-node' : ''}`}
        // クリック領域を確保するためブロック要素に、子ノードがある場合はカーソルをポインターに
        style={{ display: 'block', cursor: hasChildren ? 'pointer' : 'default' }}
        ref={nodeRef} // DOM要素の参照を設定
      >
        <span className="node-name">{node.name}</span>
        <span className="node-name">{node.name}</span>
        {/* OID部分。ここをクリックすると詳細ポップアップが表示されます */}
        <span className="node-oid" onClick={handleShowDetails}>({node.oid})</span>
        {node.description && (
          <span className="node-description">{node.description}</span>
        )}
      </span>

      {/* 子ノードがある場合、かつ展開されている場合のみ子ノードの ul をレンダリングする */}
      {hasChildren && isExpanded && (
        <ul>
          {node.children.map((childNode) => (
            <MIBTreeNode
              key={childNode.oid}
              node={childNode}
              expandedOids={expandedOids} // 展開状態を子に渡す
              toggleNodeExpansion={toggleNodeExpansion} // 展開トグル関数を子に渡す
              searchTargetOid={searchTargetOid} // 検索ターゲットOIDを子に渡す
              onNodeClickForDetails={onNodeClickForDetails} // 子コンポーネントにも渡す
            />
          ))}
        </ul>
      )}
    </li>
  );
});

// MIBノード詳細表示モーダルコンポーネント
function NodeDetailsModal({ details, loading, error, onClose }) {
    const { t } = useTranslation();

       // Escapeキーでモーダルを閉じるためのuseEffect
    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                onClose(); // onClose 関数を呼び出してモーダルを閉じる
            }
        };

        // イベントリスナーを追加
        document.addEventListener('keydown', handleKeyDown);

        // クリーンアップ関数: コンポーネントがアンマウントされるときにイベントリスナーを削除
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose]); // onClose が変更された場合にのみ再実行（通常は変更されない）

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}> {/* クリック伝播停止 */}
                <button className="modal-close-button" onClick={onClose}>&times;</button>
                {loading && <p className="loading-message">{t('modal_loading_details')}</p>}
                {error && <p className="error-message">{t('modal_failed_to_load_details')} {error}</p>}
                {details && !loading && !error && (
                    <div>
                        <h2>{details.name} ({details.oid})</h2>
                        {details.description && <p><strong>{t('modal_description')}:</strong> {details.description}</p>}
                        {details.nodeType && <p><strong>{t('modal_node_type')}:</strong> {details.nodeType}</p>}
                        {details.format && <p><strong>{t('modal_format')}:</strong> {details.format}</p>}
                        {details.decl && <p><strong>{t('modal_declaration')}:</strong> {details.decl}</p>}
                        {details.status && <p><strong>{t('modal_status')}:</strong> {details.status}</p>}
                        {details.units && <p><strong>{t('modal_units')}:</strong> {details.units}</p>}
                        {details.reference && <p><strong>{t('modal_reference')}:</strong> {details.reference}</p>}

                        {details.enumValues && details.enumValues.length > 0 && (
                            <>
                                <p><strong>{t('modal_enum_values')}:</strong></p>
                                <ul>
                                    {details.enumValues.map(enumVal => (
                                        <li key={enumVal.value}>{enumVal.label} ({enumVal.value})</li>
                                    ))}
                                </ul>
                            </>
                        )}

                        {details.ranges && details.ranges.length > 0 && (
                            <>
                                <p><strong>{t('modal_ranges')}:</strong></p>
                                <ul>
                                    {details.ranges.map((rangeVal, index) => (
                                        <li key={index}>{rangeVal.min} - {rangeVal.max}</li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// MIBツリー全体を表示するメインアプリケーションコンポーネント
function App() {
  const { t, i18n } = useTranslation(); // useTranslation フックを使用
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

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedNodeDetails, setSelectedNodeDetails] = useState(null); // NodeDetailsResponse 型のデータ
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState(null);

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

   // ノードがクリックされたときに詳細情報を取得するハンドラ
  const handleNodeClickForDetails = useCallback(async (oid) => {
    setShowDetailsModal(true); // モーダルを表示状態に
    setDetailsLoading(true);   // ロード中状態に
    setSelectedNodeDetails(null); // 前回の詳細情報をクリア
    setDetailsError(null);     // エラーをクリア

    try {
        const response = await fetch(`${API_BASE_URL}/api/mib_node_details?oid=${oid}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setSelectedNodeDetails(data); // 取得した詳細情報をセット
    } catch (err) {
        console.error('Error fetching node details:', err);
        setDetailsError(err.message); // エラーメッセージをセット
    } finally {
        setDetailsLoading(false); // ロード完了
    }
  }, []); // 依存配列は空でOK、関数は再生成されない

  // モーダルを閉じるハンドラ
  const closeDetailsModal = useCallback(() => {
    setShowDetailsModal(false);
    setSelectedNodeDetails(null);
    setDetailsError(null);
  }, []);

  // コンポーネントマウント時にバックエンドからMIBデータを取得
  useEffect(() => {
    const fetchMibData = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/mib_tree`);
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

  // OID検索だけでなく、名前でも検索できるようにhandleSearchを修正
  const handleSearch = () => {
    if (!searchQuery) {
        setSearchTargetOid(null);
        setExpandedOids(new Set());
        return;
    }

    const queryLower = searchQuery.toLowerCase();
    let foundNode = null;

    // 1. 完全一致のOIDを検索
    foundNode = flatMibNodes.current.find(node => node.oid === searchQuery);

    // 2. OIDの前方一致を検索
    if (!foundNode) {
        foundNode = flatMibNodes.current.find(node => node.oid.startsWith(searchQuery));
    }

    // 3. 名前の完全一致 (大文字小文字を区別しない) を検索
    if (!foundNode) {
        foundNode = flatMibNodes.current.find(node => node.name.toLowerCase() === queryLower);
    }

    // 4. 名前の部分一致 (大文字小文字を区別しない) を検索
    if (!foundNode) {
        foundNode = flatMibNodes.current.find(node => node.name.toLowerCase().includes(queryLower));
    }

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
        alert(t('node_not_found'));
        setSearchTargetOid(null); // ターゲットをクリア
    }
  };

  // 検索ボックスでEnterキーが押された場合のハンドラ
  const handleKeyPress = (event) => {
    if (event.key === 'Enter') {
      handleSearch();
    }
  };

  // 言語切り替えハンドラ
  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
  };

  // ロード中の表示
  if (loading) {
    return (
      <main>
        <div id="mib-tree-container" className="mib-tree">
          <p>{t('loading_mib_tree')}</p>
        </div>
      </main>
    );
  }

  // エラー発生時の表示
  if (error) {
    return (
      <main>
        <div id="mib-tree-container" className="mib-tree">
          <p className="error">{t('failed_to_load_mib_data')} {error}</p>
        </div>
      </main>
    );
  }

  // メインのレンダリング
  return (
    <>
      <header>
        <h1>{t('app_title')}</h1>
        <div className="language-switcher">
          <button onClick={() => changeLanguage('ja')} disabled={i18n.language === 'ja'}>
            {t('language_japanese')}
          </button>
          <button onClick={() => changeLanguage('en')} disabled={i18n.language === 'en'}>
            {t('language_english')}
          </button>
        </div>
      </header>
      <div className="search-bar-fixed">
        <input
          type="text"
          placeholder={t('search_placeholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyPress}
        />
        <button
          onClick={handleSearch}
        >
          {t('search_button')}
        </button>
      </div>
      <main>
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
                  onNodeClickForDetails={handleNodeClickForDetails} // 新しいプロップを渡す
                />
              ))}
            </ul>
          ) : (
            <p>{t('no_mib_nodes_to_display')}</p>
          )}
        </div>
      </main>
      <footer>
        <p>&copy; 2025 Kenshi Muto</p>
      </footer>

      {showDetailsModal && (
        <NodeDetailsModal
          details={selectedNodeDetails}
          loading={detailsLoading}
          error={detailsError}
          onClose={closeDetailsModal}
        />
      )}
    </>
  );
}

export default App;