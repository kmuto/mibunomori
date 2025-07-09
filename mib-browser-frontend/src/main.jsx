import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

import './i18n'; // i18n設定ファイルをインポート (ここで初期化される)
import { I18nextProvider } from 'react-i18next'; // I18nextProviderをインポート
import i18n from './i18n'; // 設定済みi18nインスタンスをインポート

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* I18nextProvider でアプリケーションをラップし、i18nインスタンスを渡す */}
    <I18nextProvider i18n={i18n}>
      <App />
    </I18nextProvider>
  </StrictMode>,
)
