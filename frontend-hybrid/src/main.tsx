import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './i18n';
import './local/i18n-local';
import './index.css';
import './styles/atlas.css';
import './local/theme.css';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { DialogProvider } from './components/Dialog/DialogProvider';
import { ToastProvider } from './components/Toast/ToastProvider';

// 数字员工定制（本地壳层）：主题锁定 light，不恢复保存的 accent 颜色。
// 清掉历史 dark/accent 残留，避免旧值在下次挂载时复活；accent 变量由 theme.css 定义。
localStorage.removeItem('theme');
localStorage.removeItem('clawith-accent-color');
document.documentElement.setAttribute('data-theme', 'light');

const queryClient = new QueryClient({
    defaultOptions: {
        queries: { retry: 1, refetchOnWindowFocus: false },
    },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
                <BrowserRouter>
                    <DialogProvider>
                        <ToastProvider>
                            <App />
                        </ToastProvider>
                    </DialogProvider>
                </BrowserRouter>
            </QueryClientProvider>
        </ErrorBoundary>
    </React.StrictMode>,
);
