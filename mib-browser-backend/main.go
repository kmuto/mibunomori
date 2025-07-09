package main

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"github.com/rs/cors"
	"github.com/sleepinggenius2/gosmi"
	"github.com/sleepinggenius2/gosmi/types"
)

const mibDirectory = "mibs"

// MIBツリーのノード構造を定義 (JSON出力用)
type MIBNode struct {
	Name        string              `json:"name"`
	Oid         string              `json:"oid"`
	Description string              `json:"description,omitempty"`
	Children    []*MIBNode          `json:"children,omitempty"`
	BaseType    string              `json:"nodeType,omitempty"`
	Decl        string              `json:"decl,omitempty"`
	Format      string              `json:"format,omitempty"`
	Reference   string              `json:"reference,omitempty"`
	Status      string              `json:"status,omitempty"`
	Units       string              `json:"units,omitempty"`
	EnumValues  []EnumValueResponse `json:"enumValues,omitempty"`
	Ranges      []RangeResponse     `json:"ranges,omitempty"`
}

// EnumValueResponse は列挙型の一つの値を表す構造体
type EnumValueResponse struct {
	Value int    `json:"value"`
	Label string `json:"label"`
}

// RangeResponse は範囲制約を表す構造体
type RangeResponse struct {
	Min int64 `json:"min"`
	Max int64 `json:"max"`
}

var (
	mibOnce       sync.Once  // MIBロードを一度だけ実行するためのヘルパー
	loadedMibTree []*MIBNode // MIBツリーのルートノードを格納
	mibLoadError  error      // MIBロード中に発生したエラー
)

func initSMI() error {
	mibOnce.Do(func() {
		log.Println("Initializing gosmi and loading MIBs...")

		gosmi.Init()
		log.Println("gosmi.Init() called.")

		// MIBファイル検索パスを追加
		err := filepath.WalkDir(mibDirectory, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				log.Printf("Error accessing path %s: %v", path, err)
				return nil
			}
			if d.IsDir() {
				gosmi.AppendPath(path)
				log.Printf("Added MIB search path: %s", path)
			}
			return nil
		})
		if err != nil {
			mibLoadError = fmt.Errorf("error walking MIB directory %s: %w", mibDirectory, err)
			return
		}

		// MIBファイルを個別にロード
		filesToLoad := []string{}
		filepath.WalkDir(mibDirectory, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				log.Printf("Error accessing file %s: %v", path, err)
				return nil
			}
			if !d.IsDir() {
				filesToLoad = append(filesToLoad, path)
			}
			return nil
		})

		if len(filesToLoad) == 0 {
			log.Printf("No MIB files found in %s.", mibDirectory)
		} else {
			log.Printf("Found %d potential MIB files to load.", len(filesToLoad))
		}

		loadedCount := 0
		skippedCount := 0
		for _, filePath := range filesToLoad {
			moduleName := strings.TrimSuffix(filepath.Base(filePath), filepath.Ext(filePath))

			_, err := gosmi.LoadModule(moduleName)
			if err != nil {
				log.Printf("Warning: Failed to load MIB module %s (from file %s): %v. Skipping.", moduleName, filePath, err)
				skippedCount++
			} else {
				log.Printf("Successfully loaded MIB module: %s (from file %s)", moduleName, filePath)
				loadedCount++
			}
		}
		log.Printf("Finished MIB file loading. Successfully loaded: %d, Skipped: %d", loadedCount, skippedCount)

		// MIBツリーを構築
		loadedMibTree, mibLoadError = buildMibTree()
		if mibLoadError != nil {
			log.Printf("Error building MIB tree: %v", mibLoadError)
		} else if len(loadedMibTree) == 0 {
			log.Println("No MIB roots found after building tree. Check MIB files and paths.")
		} else {
			log.Printf("Successfully built MIB tree with %d root nodes.", len(loadedMibTree))
		}
	})
	return mibLoadError
}

func buildMibTree() ([]*MIBNode, error) {
	// gosmi.GetLoadedModules() でロード済みモジュール名を取得し、各モジュールのノードを取得する
	nodesMap := make(map[string]*MIBNode)
	modules := gosmi.GetLoadedModules()
	for _, moduleName := range modules {
		module, err := gosmi.GetModule(moduleName.Name)
		if err != nil {
			log.Printf("Warning: Failed to get module %s: %v", moduleName, err)
			continue
		}
		nodes := module.GetNodes()
		for _, smiNode := range nodes {
			// OIDを持たないノードはスキップ（例: TEXTUAL-CONVENTIONなど）
			if smiNode.Oid == nil {
				continue
			}

			node := &MIBNode{
				Name: smiNode.Name,
				Oid:  smiNode.Oid.String(),
			}
			if smiNode.Description != "" {
				node.Description = smiNode.Description
			}
			if smiNode.SmiType != nil {
				node.BaseType = smiNode.SmiType.BaseType.String()
				node.Decl = smiNode.SmiType.Decl.String()
				node.Format = smiNode.SmiType.Format
				node.Reference = smiNode.SmiType.Reference
				node.Status = smiNode.SmiType.Status.String()
				node.Units = smiNode.SmiType.Units
				if smiNode.SmiType.Enum != nil {
					for _, enumVal := range smiNode.SmiType.Enum.Values {
						node.EnumValues = append(node.EnumValues, EnumValueResponse{
							Value: int(enumVal.Value),
							Label: enumVal.Name,
						})
					}
				}
				if smiNode.SmiType.Ranges != nil {
					for _, rangeVal := range smiNode.SmiType.Ranges {
						node.Ranges = append(node.Ranges, RangeResponse{
							Min: rangeVal.MinValue,
							Max: rangeVal.MaxValue,
						})
					}
				}
			}
			nodesMap[node.Oid] = node
		}
	}

	var roots []*MIBNode
	// 親子関係を構築
	for oidStr, node := range nodesMap {
		parentOidStr := getParentOid(oidStr)
		if parentOidStr == "" { // ルートOID
			roots = append(roots, node)
		} else if parentNode, ok := nodesMap[parentOidStr]; ok {
			// 親ノードが見つかったら、子として追加
			parentNode.Children = append(parentNode.Children, node)
		} else {
			// 親ノードがマップに見つからないが、ルートOIDでもない場合、
			// それ自体をルートとして扱う（孤立したMIBの場合など）
			log.Printf("Warning: Parent OID %s not found for %s (%s). Treating as root for now.", parentOidStr, node.Name, node.Oid)
			roots = append(roots, node)
		}
	}

	// 各ノードの子をOIDの数値順にソート
	for _, node := range nodesMap {
		sort.Slice(node.Children, func(i, j int) bool {
			return compareOIDs(node.Children[i].Oid, node.Children[j].Oid)
		})
	}

	// ルートノードもOIDの数値順にソート
	sort.Slice(roots, func(i, j int) bool {
		return compareOIDs(roots[i].Oid, roots[j].Oid)
	})

	return roots, nil
}

// getParentOid は与えられたOID文字列の親OID文字列を返します。
func getParentOid(oid string) string {
	parts := strings.Split(oid, ".")
	if len(parts) <= 1 {
		return ""
	}
	return strings.Join(parts[:len(parts)-1], ".")
}

// compareOIDs は2つのOID文字列を数値的に比較します。
func compareOIDs(oid1, oid2 string) bool {
	parts1 := strings.Split(oid1, ".")
	parts2 := strings.Split(oid2, ".")

	// 共通のプレフィックスを比較
	for i := 0; i < len(parts1) && i < len(parts2); i++ {
		val1 := 0
		val2 := 0
		fmt.Sscanf(parts1[i], "%d", &val1)
		fmt.Sscanf(parts2[i], "%d", &val2)

		if val1 != val2 {
			return val1 < val2
		}
	}
	// プレフィックスが同じ場合、短い方が小さい（親ノードが先にくる）
	return len(parts1) < len(parts2)
}

// mibNodeDetailsHandler は /api/mib_node_details エンドポイントのハンドラです。
func mibNodeDetailsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	oidStr := r.URL.Query().Get("oid")
	if oidStr == "" {
		http.Error(w, `{"message": "OID query parameter is required."}`, http.StatusBadRequest)
		return
	}

	smiNode, err := gosmi.GetNodeByOID(types.OidMustFromString(oidStr))
	if err != nil {
		log.Printf("Error getting node for OID %s: %v", oidStr, err)
		http.Error(w, fmt.Sprintf(`{"message": "Node not found for OID %s: %s"}`, oidStr, err.Error()), http.StatusNotFound)
		return
	}

	response := MIBNode{
		Name: smiNode.Name,
		Oid:  smiNode.Oid.String(),
	}
	if smiNode.Description != "" {
		response.Description = smiNode.Description
	}
	if smiNode.SmiType != nil {
		response.BaseType = smiNode.SmiType.BaseType.String()
		response.Decl = smiNode.SmiType.Decl.String()
		response.Format = smiNode.SmiType.Format
		response.Reference = smiNode.SmiType.Reference
		response.Status = smiNode.SmiType.Status.String()
		response.Units = smiNode.SmiType.Units
		if smiNode.SmiType.Enum != nil {
			for _, enumVal := range smiNode.SmiType.Enum.Values {
				response.EnumValues = append(response.EnumValues, EnumValueResponse{
					Value: int(enumVal.Value),
					Label: enumVal.Name,
				})
			}
		}
		if smiNode.SmiType.Ranges != nil {
			for _, rangeVal := range smiNode.SmiType.Ranges {
				response.Ranges = append(response.Ranges, RangeResponse{
					Min: rangeVal.MinValue,
					Max: rangeVal.MaxValue,
				})
			}
		}
	}

	jsonBytes, err := json.MarshalIndent(response, "", "  ")
	if err != nil {
		log.Printf("Error marshalling node details to JSON: %v", err)
		http.Error(w, `{"message": "Error processing node details."}`, http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
	w.Write(jsonBytes)
}

// mibTreeHandler は /api/mib_tree エンドポイントのハンドラです。
func mibTreeHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if mibLoadError != nil {
		http.Error(w, fmt.Sprintf(`{"message": "MIB loading failed: %s"}`, mibLoadError.Error()), http.StatusInternalServerError)
		return
	}
	if len(loadedMibTree) == 0 {
		http.Error(w, `{"message": "No MIBs loaded or no roots found."}`, http.StatusInternalServerError)
		return
	}

	jsonBytes, err := json.MarshalIndent(loadedMibTree, "", "  ")
	if err != nil {
		log.Printf("Error marshalling MIB tree to JSON: %v", err)
		http.Error(w, `{"message": "Error processing MIB tree."}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write(jsonBytes)
}

func main() {
	// MIBディレクトリの存在確認
	if _, err := os.Stat(mibDirectory); os.IsNotExist(err) {
		log.Fatalf("MIB directory '%s' not found. Please create it and place MIB files inside.", mibDirectory)
	}

	// SMI（gosmi）の初期化とMIBロードはメイン関数の早い段階で一度だけ行う
	if err := initSMI(); err != nil {
		log.Fatalf("Failed to initialize SMI and load MIBs: %v", err)
	}

	// HTTPサーバーの設定
	mux := http.NewServeMux()
	mux.HandleFunc("/api/mib_tree", mibTreeHandler)
	mux.HandleFunc("/api/mib_node_details", mibNodeDetailsHandler)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "SNMP MIB Browser Backend is running. Access /api/mib_tree to get MIB data.")
	})

	// CORSミドルウェアの設定

	// 環境変数から許可するオリジンを読み込む
	// カンマ区切りで複数のオリジンを指定できるようにする
	allowedOriginsStr := os.Getenv("FRONTEND_ORIGINS")
	var allowedOrigins []string
	if allowedOriginsStr != "" {
		allowedOrigins = strings.Split(allowedOriginsStr, ",")
		// 各オリジンの前後の空白をトリム
		for i, origin := range allowedOrigins {
			allowedOrigins[i] = strings.TrimSpace(origin)
		}
	} else {
		// 環境変数が設定されていない場合のデフォルト値
		allowedOrigins = []string{"http://localhost:5173"}
		log.Printf("FRONTEND_ORIGINS environment variable not set. Defaulting to %v", allowedOrigins)
	}
	c := cors.New(cors.Options{
		AllowedOrigins:   allowedOrigins,                                      // Reactアプリのオリジンを指定
		AllowCredentials: true,                                                // クッキーなどの認証情報を許可する場合
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}, // 許可するHTTPメソッド
		AllowedHeaders:   []string{"*"},                                       // 全てのヘッダーを許可。特定のヘッダーのみ許可する場合は具体的に記述
		// ExposedHeaders:   []string{"Link"}, // クライアントに公開したいレスポンスヘッダー
		MaxAge: 300, // Preflightリクエストの結果をキャッシュする時間 (秒)
	})

	// CORSミドルウェアをHTTPハンドラに適用
	handler := c.Handler(mux)

	port := os.Getenv("PORT")
	if port == "" {
		port = "5000" // デフォルトポート
	}
	log.Printf("Starting server on :%s...", port)
	log.Fatal(http.ListenAndServe(":"+port, handler))
}
