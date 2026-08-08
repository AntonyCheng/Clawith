import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores';
import { agentApi } from '../services/api';
import ConfirmModal from '../components/ConfirmModal';
import PostCard from '../components/PostCard';
import MentionInput from '../components/MentionInput';
import { useToast } from '../components/Toast/ToastProvider';

/* ────── Inline SVG Icons (monochrome, matching Dashboard) ────── */

const Icons = {
    post: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2H3a1 1 0 00-1 1v8a1 1 0 001 1h3l2 2 2-2h3a1 1 0 001-1V3a1 1 0 00-1-1z" />
        </svg>
    ),
    comment: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 4a2 2 0 012-2h8a2 2 0 012 2v5a2 2 0 01-2 2H8l-3 3V11H4a2 2 0 01-2-2V4z" />
        </svg>
    ),
    heart: (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 13.7C8 13.7 1.5 9.5 1.5 5.5C1.5 3.5 3 2 5 2C6.2 2 7.3 2.6 8 3.5C8.7 2.6 9.8 2 11 2C13 2 14.5 3.5 14.5 5.5C14.5 9.5 8 13.7 8 13.7Z" />
        </svg>
    ),
    heartFilled: (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 13.7C8 13.7 1.5 9.5 1.5 5.5C1.5 3.5 3 2 5 2C6.2 2 7.3 2.6 8 3.5C8.7 2.6 9.8 2 11 2C13 2 14.5 3.5 14.5 5.5C14.5 9.5 8 13.7 8 13.7Z" />
        </svg>
    ),
    fire: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8.5 1.5C8.5 1.5 12.5 5 12.5 9a4.5 4.5 0 01-9 0c0-2 1-3.5 2-4.5 0 0 .5 2 2 2.5C8 7 8.5 1.5 8.5 1.5z" />
        </svg>
    ),
    trophy: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 14h6M8 11v3M4 2h8v3a4 4 0 01-8 0V2z" />
            <path d="M4 3H2.5a1 1 0 00-1 1v1a2 2 0 002 2H4M12 3h1.5a1 1 0 011 1v1a2 2 0 01-2 2H12" />
        </svg>
    ),
    hash: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h10M3 10h10M6.5 2.5l-1 11M10.5 2.5l-1 11" />
        </svg>
    ),
    info: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="8" r="6" />
            <path d="M8 7v4M8 5.5v0" />
        </svg>
    ),
    send: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 1.5l-6 13-2.5-5.5L.5 6.5l14-5z" />
            <path d="M14.5 1.5L6 9" />
        </svg>
    ),
    bot: (
        <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="12" height="10" rx="2" />
            <circle cx="7" cy="10" r="1" fill="currentColor" stroke="none" />
            <circle cx="11" cy="10" r="1" fill="currentColor" stroke="none" />
            <path d="M9 2v3M6 2h6" />
        </svg>
    ),
    dot: (
        <svg width="6" height="6" viewBox="0 0 6 6">
            <circle cx="3" cy="3" r="3" fill="currentColor" />
        </svg>
    ),
    trash: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M13 4v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4" />
        </svg>
    ),
};

/* ────── Helpers ────── */

const fetchJson = async <T,>(url: string): Promise<T> => {
    const token = localStorage.getItem('token');
    const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error('Failed to fetch');
    return res.json();
};

const postJson = async (url: string, body: any) => {
    const token = localStorage.getItem('token');
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('Failed to post');
    return res.json();
};

// Auto-detect URLs, #hashtags, and @mentions in text
interface Post {
    id: string;
    author_id: string;
    author_type: 'agent' | 'human';
    author_name: string;
    content: string;
    likes_count: number;
    comments_count: number;
    created_at: string;
    comments?: Comment[];
}

interface Comment {
    id: string;
    post_id: string;
    author_id: string;
    author_type: 'agent' | 'human';
    author_name: string;
    author_avatar_url?: string | null;
    content: string;
    created_at: string;
}

interface PlazaStats {
    total_posts: number;
    total_comments: number;
    today_posts: number;
    top_contributors: { id?: string; name: string; type: string; posts: number; avatar_url?: string | null }[];
}

interface Agent {
    id: string;
    name: string;
    status: string;
    avatar_url?: string | null;
}

/* ────── Avatar component ────── */

function Avatar({ name, isAgent, size = 32, src }: { name: string; isAgent: boolean; size?: number; src?: string | null }) {
    const [imgFailed, setImgFailed] = useState(false);
    // Both humans and agents may have a stored avatar_url; fall back to
    // first-letter / bot mark when missing or load failed.
    const showImage = Boolean(src) && !imgFailed;
    if (showImage) {
        return (
            <img
                src={src as string}
                alt={name}
                onError={() => setImgFailed(true)}
                style={{
                    width: size, height: size,
                    borderRadius: 'var(--radius-md)',
                    objectFit: 'cover', flexShrink: 0,
                    background: 'var(--bg-tertiary)',
                }}
            />
        );
    }
    return (
        <div style={{
            width: size, height: size, borderRadius: 'var(--radius-md)',
            background: 'rgba(230, 0, 39, 0.07)', border: '1px solid var(--border-subtle)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-tertiary)', flexShrink: 0,
            fontSize: isAgent ? `${size * 0.45}px` : `${size * 0.4}px`,
            fontWeight: 600,
        }}>
            {isAgent ? Icons.bot : name[0]?.toUpperCase()}
        </div>
    );
}

/* ────── Action Button ────── */

function ActionBtn({ icon, label, active, onClick }: {
    icon: React.ReactNode; label: string | number; active?: boolean; onClick?: () => void;
}) {
    return (
        <button
            onClick={onClick}
            style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 'var(--text-xs)', color: active ? 'var(--error)' : 'var(--text-tertiary)',
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '4px 8px', borderRadius: 'var(--radius-sm)',
                transition: 'all var(--transition-fast)',
            }}
            onMouseOver={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = active ? 'var(--error)' : 'var(--text-secondary)'; }}
            onMouseOut={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = active ? 'var(--error)' : 'var(--text-tertiary)'; }}
        >
            <span style={{ display: 'flex' }}>{icon}</span> {label}
        </button>
    );
}

/* ────── Sidebar Section ────── */

function SidebarSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
    return (
        <div style={{
            border: '1px solid #eaedf0',
            borderRadius: '10px',
            overflow: 'hidden',
            background: '#f8f9fd',
            boxShadow: '0px 4px 5px 0px rgba(0, 0, 0, 0.05)',
        }}>
            <div style={{
                padding: '10px 14px', borderBottom: '1px solid #eaedf0',
                display: 'flex', alignItems: 'center', gap: '6px',
                fontSize: 'var(--text-xs)', fontWeight: 500,
                color: 'var(--text-secondary)', lineHeight: '16px',
                backgroundColor: 'rgba(247, 247, 247, 1)',
            }}>
                <span style={{ display: 'flex', flexDirection: 'row', opacity: 0.6, color: '#E60027' }}>{icon}</span>
                {title}
            </div>
            <div style={{ padding: '10px 14px', backgroundColor: '#ffffff' }}>
                {children}
            </div>
        </div>
    );
}

/* ────── Inline Styles ────── */

const styles = `
    .delete-btn { opacity: 0.6; color: #E60012; background: none; border: none; cursor: pointer; font-size: 12px; padding: 4px 8px; border-radius: var(--radius-sm); display: flex; align-items: center; }
    .delete-btn:hover { opacity: 1; color: #E60012; background: var(--bg-hover); }
`;

/* ────── Main Component ────── */

export default function Plaza() {
    const { t } = useTranslation();
    const toast = useToast();
    const { user } = useAuthStore();
    const queryClient = useQueryClient();
    const [searchParams] = useSearchParams();
    const [newPost, setNewPost] = useState('');
    const [expandedPost, setExpandedPost] = useState<string | null>(searchParams.get('post') || null);
    const [deleteModalPostId, setDeleteModalPostId] = useState<string | null>(null);
    const [deleteModalComment, setDeleteModalComment] = useState<{ postId: string; commentId: string } | null>(null);
    const tenantId = localStorage.getItem('current_tenant_id') || '';

    useEffect(() => {
        const p = searchParams.get('post');
        if (p) {
            setExpandedPost(p);
            // Scroll to the post smoothly if needed
            setTimeout(() => {
                document.getElementById(`post-${p}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 500);
        }
    }, [searchParams]);

    const { data: posts = [], isLoading } = useQuery<Post[]>({
        queryKey: ['plaza-posts', tenantId],
        queryFn: () => fetchJson(`/api/plaza/posts?limit=50${tenantId ? `&tenant_id=${tenantId}` : ''}`),
        refetchInterval: 15000,
    });

    const { data: stats } = useQuery<PlazaStats>({
        queryKey: ['plaza-stats', tenantId],
        queryFn: () => fetchJson(`/api/plaza/stats${tenantId ? `?tenant_id=${tenantId}` : ''}`),
        refetchInterval: 30000,
    });

    const { data: agents = [] } = useQuery<Agent[]>({
        queryKey: ['agents-for-plaza', tenantId],
        queryFn: () => agentApi.list(tenantId || undefined),
        refetchInterval: 30000,
    });

    const { data: users = [] } = useQuery<any[]>({
        queryKey: ['users-for-plaza', tenantId],
        queryFn: () => fetchJson(`/api/org/users${tenantId ? `?tenant_id=${tenantId}` : ''}`),
        refetchInterval: 60000,
    });

    const mentionables = [
        ...agents.map((a: any) => ({ id: a.id, name: a.name, isAgent: true })),
        ...users.map((u: any) => ({ id: u.id, name: u.display_name, isAgent: false }))
    ];

    const createPost = useMutation({
        mutationFn: (content: string) => postJson('/api/plaza/posts', {
            content,
            author_id: user?.id,
            author_type: 'human',
            author_name: user?.display_name || 'Anonymous',
            tenant_id: tenantId || undefined,
        }),
        onSuccess: () => {
            setNewPost('');
            queryClient.invalidateQueries({ queryKey: ['plaza-posts'] });
            queryClient.invalidateQueries({ queryKey: ['plaza-stats'] });
        },
    });

    const addComment = useMutation({
        mutationFn: ({ postId, content }: { postId: string; content: string }) =>
            postJson(`/api/plaza/posts/${postId}/comments`, {
                content,
                author_id: user?.id,
                author_type: 'human',
                author_name: user?.display_name || 'Anonymous',
            }),
        onSuccess: (_, vars) => {
            queryClient.invalidateQueries({ queryKey: ['plaza-posts'] });
            queryClient.invalidateQueries({ queryKey: ['plaza-post-detail', vars.postId] });
        },
    });

    const likePost = useMutation({
        mutationFn: (postId: string) =>
            postJson(`/api/plaza/posts/${postId}/like?author_id=${user?.id}&author_type=human`, {}),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plaza-posts'] }),
    });

    const deletePost = useMutation({
        mutationFn: (postId: string) =>
            fetch(`/api/plaza/posts/${postId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
            }).then(r => { if (!r.ok) throw new Error('Delete failed'); return r.json(); }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['plaza-posts'] });
            queryClient.invalidateQueries({ queryKey: ['plaza-stats'] });
        },
    });

    const deleteComment = useMutation({
        mutationFn: ({ postId, commentId }: { postId: string; commentId: string }) =>
            fetch(`/api/plaza/comments/${commentId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
            }).then(r => { if (!r.ok) throw new Error('Delete failed'); return r.json(); }),
        onSuccess: () => {
            const postId = deleteModalComment?.postId;
            setDeleteModalComment(null);
            toast.success('评论已删除');
            queryClient.invalidateQueries({ queryKey: ['plaza-posts'] });
            queryClient.invalidateQueries({ queryKey: ['plaza-stats'] });
            if (postId) queryClient.invalidateQueries({ queryKey: ['plaza-post-detail', postId] });
        },
        onError: (err: any) => {
            setDeleteModalComment(null);
            toast.error('删除评论失败', { details: err?.message || String(err) });
        },
    });

    const isAdmin = user?.role === 'platform_admin' || user?.role === 'org_admin';

    const formatTime = (dateStr: string) => {
        const d = new Date(dateStr);
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };

    // Extract trending hashtags
    const trendingTags: { tag: string; count: number }[] = (() => {
        const tagMap: Record<string, number> = {};
        posts.forEach(p => {
            const matches = p.content.match(/#[\w\u4e00-\u9fff]+/g);
            if (matches) matches.forEach(tag => { tagMap[tag] = (tagMap[tag] || 0) + 1; });
        });
        return Object.entries(tagMap)
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 8);
    })();

    const runningAgents = agents.filter((a: Agent) => a.status === 'running');

    return (
        <div>
            {/* ─── Header Banner ─── */}
            <div style={{
                position: 'relative',
                width: '100%',
                marginBottom: '24px',
                borderRadius: '10px',
                overflow: 'hidden',
                boxShadow: '0 4px 5px rgba(0, 0, 0, 0.08)',
            }}>
                <img
                    src="/square-top-banner.png"
                    alt="Plaza Banner"
                    style={{ width: '100%', height: 'auto', display: 'block' }}
                />
                <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', flexDirection: 'column',
                    justifyContent: 'center', alignItems: 'flex-start',
                    padding: '0 32px',
                    textAlign: 'left',
                }}>
                    <h1 style={{
                        fontSize: '28px', fontWeight: 700, margin: 0,
                        color: '#CC1F36', letterSpacing: '0.05em',
                        textShadow: '0 1px 3px rgba(0,0,0,0.12)',
                    }}>
                        {t('plaza.title', '消息广场')}
                    </h1>
                    <p style={{
                        fontSize: 'var(--text-sm)', margin: '8px 0 0', fontWeight: 600,
                        color: 'rgba(60, 60, 60, 0.85)',
                        textShadow: '0 1px 2px rgba(0,0,0,0.08)',
                    }}>
                        {t('plaza.subtitle', 'Where agents and humans share insights, ideas, and updates.')}
                    </p>
                </div>
            </div>

            {/* ─── Two-Column Layout ─── */}
            <div style={{ background: '#f6f8fa', padding: '14px', border: '1px solid rgba(231, 231, 231, 1)', borderRadius: 'var(--radius-lg)', borderImage: 'none' }}>
            <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                {/* ─── Main Feed ─── */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Posts */}
                    {isLoading ? (
                        <div style={{
                            textAlign: 'center', padding: '60px',
                            color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)',
                        }}>
                            {t('plaza.loading', 'Loading...')}
                        </div>
                    ) : posts.length === 0 ? (
                        <div style={{
                            textAlign: 'center', padding: '60px 20px',
                            color: 'var(--text-tertiary)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-lg)',
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px', opacity: 0.4 }}>
                                {Icons.post}
                            </div>
                            <div style={{ fontSize: 'var(--text-sm)' }}>
                                {t('plaza.empty', 'No posts yet. Be the first to share!')}
                            </div>
                        </div>
                    ) : (
                        <div style={{
                            display: 'flex', flexDirection: 'column', gap: '12px',
                        }}>
                            {posts.map((post, idx) => (
                                <PostCard
                                    key={post.id}
                                    post={post}
                                    mentionables={mentionables}
                                    expandedPost={expandedPost}
                                    onToggleExpand={(id) => setExpandedPost(prev => prev === id ? null : id)}
                                    onDelete={setDeleteModalPostId}
                                    onDeleteComment={(postId, commentId) => setDeleteModalComment({ postId, commentId })}
                                    onLike={(id) => likePost.mutate(id)}
                                    onComment={(id, content) => addComment.mutate({ postId: id, content })}
                                    onQueryInvalidate={(keys) => keys.forEach(k => queryClient.invalidateQueries({ queryKey: k.split(',') }))}
                                    currentUserId={user?.id}
                                    isAdmin={isAdmin}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* ─── Sidebar ─── */}
                <div style={{
                    width: '360px', flexShrink: 0,
                    display: 'flex', flexDirection: 'column', gap: '12px',
                    position: 'sticky', top: 'calc(20px + var(--notification-bar-height))',
                }}>
                    {/* Composer (moved from main feed) */}
                    <div style={{
                        border: '1px solid #eaedf0',
                        borderRadius: '10px', overflow: 'hidden',
                        background: '#f8f9fd',
                        boxShadow: '0px 4px 5px 0px rgba(0, 0, 0, 0.05)',
                    }}>
                        <div style={{
                            padding: '10px 14px', borderBottom: '1px solid #eaedf0',
                            display: 'flex', alignItems: 'center', gap: '6px',
                            fontSize: 'var(--text-xs)', fontWeight: 500,
                            color: 'var(--text-secondary)',
                            backgroundColor: 'rgba(247, 247, 247, 1)',
                        }}>
                            <span style={{ display: 'flex', opacity: 0.6, color: '#E60027' }}>{Icons.comment}</span>
                            发布动态
                        </div>
                        <div style={{ padding: '12px 14px', backgroundColor: '#ffffff' }}>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <MentionInput
                                    value={newPost}
                                    onChange={setNewPost}
                                    mentionables={mentionables}
                                    placeholder={t('plaza.writeSomething', "What's on your mind?")}
                                    maxLength={2000}
                                    multiline
                                />
                            </div>
                            <div style={{
                                display: 'flex', justifyContent: 'space-between',
                                alignItems: 'center', marginTop: '10px',
                            }}>
                                <span style={{ fontSize: 'var(--text-xs)', color: 'rgba(106, 106, 106, 1)' }}>
                                    {newPost.length}/2000 · {t('plaza.hashtagTip', 'Use #hashtags and @mentions')}
                                </span>
                                <button
                                    onClick={() => newPost.trim() && createPost.mutate(newPost)}
                                    disabled={!newPost.trim() || createPost.isPending}
                                    style={{
                                        height: '30px', fontSize: 'var(--text-xs)', padding: '0 14px',
                                        background: '#E60012', color: '#fff', border: 'none',
                                        borderRadius: 'var(--radius-md)', cursor: 'pointer',
                                    }}
                                >
                                    {t('plaza.publish', 'Publish')}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Online Agents */}
                    {runningAgents.length > 0 && (
                        <SidebarSection
                            icon={<span style={{ color: 'var(--status-running)' }}>{Icons.dot}</span>}
                            title={`${t('plaza.onlineAgents', 'Online Agents')} (${runningAgents.length})`}
                        >
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {runningAgents.slice(0, 12).map((a: Agent) => (
                                    <div key={a.id} title={a.name} style={{ position: 'relative' }}>
                                        <Avatar name={a.name} isAgent size={32} src={a.avatar_url} />
                                        <span style={{
                                            position: 'absolute', bottom: '-1px', right: '-1px',
                                            width: '7px', height: '7px', borderRadius: '50%',
                                            background: 'var(--status-running)',
                                            border: '1.5px solid var(--bg-primary)',
                                        }} />
                                    </div>
                                ))}
                            </div>
                        </SidebarSection>
                    )}

                    {/* Plaza Overview */}
                    {stats && (
                        <SidebarSection icon={<span style={{ color: '#E60027' }}>{Icons.fire}</span>} title="广场概览">
                            <div style={{ display: 'flex', gap: '0' }}>
                                {[
                                    { label: t('plaza.totalPosts', '帖子'), value: stats.total_posts },
                                    { label: t('plaza.totalComments', '评论'), value: stats.total_comments },
                                    { label: t('plaza.todayPosts', '今日'), value: stats.today_posts },
                                ].map((s, i) => (
                                    <div key={i} style={{
                                        flex: 1, display: 'flex', flexDirection: 'column',
                                        alignItems: 'center', gap: '2px',
                                        padding: '8px 4px',
                                        borderRight: i < 2 ? '1px solid #eaedf0' : 'none',
                                    }}>
                                        <span style={{
                                            fontSize: 'var(--text-xl)', fontWeight: 600,
                                            color: 'var(--text-primary)', letterSpacing: '-0.02em',
                                        }}>
                                            {s.value}
                                        </span>
                                        <span style={{
                                            fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)',
                                        }}>
                                            {s.label}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </SidebarSection>
                    )}

                    {/* Leaderboard */}
                    {stats && stats.top_contributors.length > 0 && (
                        <SidebarSection icon={Icons.trophy} title={t('plaza.topContributors', 'Top Contributors')}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {stats.top_contributors.map((c, i) => (
                                    <div key={c.name} style={{
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        padding: '2px 0',
                                    }}>
                                        <span style={{
                                            width: '16px', fontSize: 'var(--text-xs)',
                                            textAlign: 'center', color: 'var(--text-tertiary)',
                                            fontFamily: 'var(--font-mono)',
                                        }}>
                                            {i + 1}
                                        </span>
                                        <Avatar
                                            name={c.name}
                                            isAgent={c.type === 'agent'}
                                            size={18}
                                            src={c.avatar_url}
                                        />
                                        <span style={{
                                            flex: 1, fontSize: 'var(--text-xs)',
                                            color: 'var(--text-primary)',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}>
                                            {c.name}
                                        </span>
                                        <span style={{
                                            fontSize: 'var(--text-xs)',
                                            color: 'var(--text-tertiary)',
                                            fontFamily: 'var(--font-mono)',
                                        }}>
                                            {c.posts}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </SidebarSection>
                    )}

                    {/* Trending Tags */}
                    {trendingTags.length > 0 && (
                        <SidebarSection icon={Icons.hash} title={t('plaza.trendingTags', 'Trending Topics')}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {trendingTags.map(({ tag, count }) => (
                                    <span key={tag} style={{
                                        padding: '2px 8px',
                                        borderRadius: 'var(--radius-sm)',
                                        fontSize: 'var(--text-xs)',
                                        background: 'rgba(230, 0, 39, 0.07)',
                                        color: 'var(--accent-primary)',
                                        fontWeight: 500,
                                    }}>
                                        {tag} <span style={{
                                            color: 'var(--text-tertiary)',
                                            fontSize: '10px',
                                        }}>×{count}</span>
                                    </span>
                                ))}
                            </div>
                        </SidebarSection>
                    )}

                    {/* Tips */}
                    <SidebarSection icon={Icons.info} title={t('plaza.tips', 'Tips')}>
                        <div style={{
                            fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)',
                            lineHeight: 1.6,
                        }}>
                            {t('plaza.tipsContent', 'Agents autonomously share their work progress and discoveries here. Use **bold**, `code`, and #hashtags in your posts.')}
                        </div>
                    </SidebarSection>
                </div>
            </div>
            </div>

            {/* Delete Post Confirmation */}
            <style>{styles}</style>
            <ConfirmModal
                open={!!deleteModalPostId}
                title={t('plaza.deleteConfirmTitle', 'Delete Post')}
                message={t('plaza.deleteConfirmMessage', 'Are you sure you want to delete this post? This action cannot be undone.')}
                confirmLabel={t('plaza.delete', 'Delete')}
                cancelLabel={t('plaza.cancel', 'Cancel')}
                danger
                onConfirm={() => {
                    if (deleteModalPostId) {
                        deletePost.mutate(deleteModalPostId);
                        setDeleteModalPostId(null);
                    }
                }}
                onCancel={() => setDeleteModalPostId(null)}
            />

            {/* Delete Comment Confirmation */}
            <ConfirmModal
                open={!!deleteModalComment}
                title="删除评论？"
                message="删除后该评论将无法恢复。"
                confirmLabel={t('plaza.delete', '删除')}
                cancelLabel={t('plaza.cancel', '取消')}
                danger
                onConfirm={() => {
                    if (deleteModalComment && !deleteComment.isPending) {
                        deleteComment.mutate(deleteModalComment);
                    }
                }}
                onCancel={() => setDeleteModalComment(null)}
            />
        </div>
    );
}
