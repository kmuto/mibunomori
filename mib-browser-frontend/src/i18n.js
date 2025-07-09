import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import Backend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

i18n
  // HTTPバックエンドプラグインをロードし、翻訳ファイルを非同期で読み込む
  .use(Backend)
  // ブラウザの言語設定を自動検出するプラグイン
  .use(LanguageDetector)
  // react-i18next を初期化し、i18n インスタンスを React コンポーネントに提供する
  .use(initReactI18next)
  // i18next の設定
  .init({
    fallbackLng: 'en', // 検出された言語の翻訳がない場合、デフォルトで英語を使用
    debug: false, // 開発中は true にするとデバッグ情報が表示される

    // 翻訳ファイルの場所と命名規則を設定
    backend: {
      loadPath: '/locales/{{lng}}/translation.json', // 翻訳ファイルへのパス
    },

    // 言語検出オプション
    detection: {
      order: ['queryString', 'cookie', 'localStorage', 'sessionStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage', 'cookie'],
    },

    // 名前空間 (ここでは 'translation' のみを使用)
    ns: ['translation'],
    defaultNS: 'translation',

    // React の設定
    react: {
      useSuspense: false, // true にすると翻訳ロード中に Suspense が必要になる
    },

    interpolation: {
      escapeValue: false, // React は XSS を防ぐため、エスケープは不要
    },
  });

export default i18n;
