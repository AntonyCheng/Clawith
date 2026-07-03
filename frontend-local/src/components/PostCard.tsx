import { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import MentionInput from './MentionInput';

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

const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
};

/* ────── Inline SVG Icons ────── */

const Icons = {
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
    comment: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 4a2 2 0 012-2h8a2 2 0 012 2v5a2 2 0 01-2 2H8l-3 3V11H4a2 2 0 01-2-2V4z" />
        </svg>
    ),
    send: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 1.5l-6 13-2.5-5.5L.5 6.5l14-5z" />
            <path d="M14.5 1.5L6 9" />
        </svg>
    ),
    trash: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M13 4v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4" />
        </svg>
    ),
    chevronDown: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6l4 4 4-4" />
        </svg>
    ),
    chevronUp: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 10l4-4 4 4" />
        </svg>
    ),
};

/* ────── Action Button ────── */

function ActionBtn({ icon, label, active, onClick, color, hoverColor }: { icon: React.ReactNode; label: number; active?: boolean; onClick: () => void; color?: string; hoverColor?: string }) {
    const baseColor = color ?? (active ? 'var(--accent-primary)' : 'var(--text-tertiary)');
    const hover = hoverColor ?? baseColor;
    return (
        <button
            onClick={onClick}
            style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '3px 8px', border: 'none', borderRadius: 'var(--radius-sm)',
                background: 'transparent', cursor: 'pointer',
                color: baseColor,
                fontSize: 'var(--text-xs)', fontWeight: 500,
                transition: 'color var(--transition-fast)',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = hover; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = baseColor; }}
        >
            <span style={{ display: 'flex' }}>{icon}</span>
            <span>{label || 0}</span>
        </button>
    );
}

/* ────── Avatar ────── */

function Avatar({ name, isAgent, size = 32 }: { name: string; isAgent: boolean; size?: number }) {
    const initial = (Array.from(name || '?')[0] || '?').toUpperCase();
    return (
        <div style={{
            width: `${size}px`, height: `${size}px`, borderRadius: '50%',
            background: isAgent
                ? 'linear-gradient(135deg, #1D61F7 0%, #0066FF 100%)'
                : 'linear-gradient(135deg, #667085 0%, #344054 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: `${Math.round(size * 0.4)}px`, fontWeight: 600, color: '#fff', flexShrink: 0,
            userSelect: 'none',
        }}>
            {initial}
        </div>
    );
}

/* ────── Content Renderer ────── */

const linkifyContent = (text: string) => {
    const parts = text.split(/(https?:\/\/[^\s<>"'()\uff0c\u3002\uff01\uff1f\u3001\uff1b\uff1a]+|#[\w\u4e00-\u9fff]+|@\S+)/g);
    if (parts.length <= 1) return text;
    return parts.map((part, i) => {
        if (i % 2 === 1) {
            if (part.startsWith('#')) {
                return (
                    <span key={i} style={{ color: 'var(--accent-primary)', fontWeight: 500 }}>{part}</span>
                );
            }
            if (part.startsWith('@')) {
                return (
                    <span key={i} style={{ color: 'var(--accent-primary)', fontWeight: 600, cursor: 'default' }}>{part}</span>
                );
            }
            return (
                <a key={i} href={part} target="_blank" rel="noopener noreferrer"
                    style={{ color: 'var(--accent-primary)', textDecoration: 'none', wordBreak: 'break-all' }}
                    onMouseOver={e => (e.currentTarget.style.textDecoration = 'underline')}
                    onMouseOut={e => (e.currentTarget.style.textDecoration = 'none')}
                >{part.length > 60 ? part.substring(0, 57) + '...' : part}</a>
            );
        }
        return part;
    });
};

const renderContent = (text: string) => {
    const elements: any[] = [];
    const lines = text.split('\n');
    lines.forEach((line, li) => {
        const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
        parts.forEach((part, pi) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                elements.push(<strong key={`${li}-${pi}`}>{part.slice(2, -2)}</strong>);
            } else if (part.startsWith('`') && part.endsWith('`')) {
                elements.push(
                    <code key={`${li}-${pi}`} style={{
                        background: 'var(--bg-tertiary)', padding: '1px 5px',
                        borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)',
                        fontFamily: 'var(--font-mono)',
                    }}>{part.slice(1, -1)}</code>
                );
            } else {
                const linked = linkifyContent(part);
                if (Array.isArray(linked)) {
                    elements.push(...linked.map((el, ei) =>
                        typeof el === 'string' ? <span key={`${li}-${pi}-${ei}`}>{el}</span> : el
                    ));
                } else {
                    elements.push(<span key={`${li}-${pi}`}>{linked}</span>);
                }
            }
        });
        if (li < lines.length - 1) elements.push(<br key={`br-${li}`} />);
    });
    return elements;
};

/* ────── Types ────── */

export interface PlazaComment {
    id: string;
    author_name: string;
    author_type: string;
    created_at: string;
    content: string;
}

export interface Post {
    id: string;
    author_name: string;
    author_type: 'human' | 'agent';
    author_id: string;
    content: string;
    likes_count: number;
    comments_count: number;
    created_at: string;
    comments?: PlazaComment[];
}

export interface Mentionable {
    id: string;
    name: string;
    isAgent: boolean;
}

/* ────── PostCard Props ────── */

export interface PostCardProps {
    post: Post;
    mentionables: Mentionable[];
    expandedPost: string | null;
    onToggleExpand: (postId: string) => void;
    onDelete: (postId: string) => void;
    onLike: (postId: string) => void;
    onComment: (postId: string, content: string) => void;
    onQueryInvalidate: (key: string[]) => void;
    currentUserId?: string;
    isAdmin: boolean;
}

/* ────── PostCard Component ────── */

export default function PostCard({
    post,
    mentionables,
    expandedPost,
    onToggleExpand,
    onDelete,
    onLike,
    onComment,
    onQueryInvalidate,
    currentUserId,
    isAdmin,
}: PostCardProps) {
    const { t } = useTranslation();
    const isExpanded = expandedPost === post.id;
    const [localComment, setLocalComment] = useState('');
    const [isContentExpanded, setIsContentExpanded] = useState(false);
    const [isOverflowing, setIsOverflowing] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = contentRef.current;
        if (!el) return;
        const checkOverflow = () => setIsOverflowing(el.scrollHeight > el.clientHeight + 4);
        checkOverflow();
        const observer = new ResizeObserver(checkOverflow);
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const { data: postDetail } = useQuery<Post>({
        queryKey: ['plaza-post-detail', post.id],
        queryFn: () => fetchJson<Post>(`/api/plaza/posts/${post.id}`),
        enabled: isExpanded,
    });

    const addComment = useMutation({
        mutationFn: (payload: { postId: string; content: string }) =>
            postJson(`/api/plaza/posts/${payload.postId}/comments`, {
                content: payload.content,
                author_id: currentUserId,
                author_type: 'human',
                author_name: '',
            }),
        onSuccess: (_, vars) => {
            setLocalComment('');
            onQueryInvalidate(['plaza-posts']);
            onQueryInvalidate([`plaza-post-detail,${vars.postId}`]);
        },
    });

    const comments: PlazaComment[] = (postDetail?.comments || post.comments || []) as PlazaComment[];

    const handleCommentSubmit = () => {
        if (localComment.trim()) {
            addComment.mutate({ postId: post.id, content: localComment });
        }
    };

    return (
        <div
            id={`post-${post.id}`}
            style={{
                padding: '14px 16px',
                border: '1px solid #eaedf0',
                borderRadius: '10px',
                overflow: 'hidden',
                background: '#f8f9fd',
                boxShadow: '0 4px 5px rgba(0, 0, 0, 0.08)',
            }}
        >
            {/* Author row */}
            <div style={{
                display: 'flex', alignItems: 'center',
                gap: '10px', marginBottom: '8px',
            }}>
                <Avatar name={post.author_name} isAgent={post.author_type === 'agent'} size={30} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                        fontSize: 'var(--text-sm)', fontWeight: 500,
                        display: 'flex', alignItems: 'center', gap: '6px',
                        color: 'var(--text-primary)',
                    }}>
                        {post.author_name}
                        {post.author_type === 'agent' && (
                            <span style={{
                                fontSize: '10px', padding: '1px 5px',
                                background: 'var(--bg-tertiary)',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-secondary)',
                                borderRadius: 'var(--radius-sm)',
                                fontWeight: 500, lineHeight: '14px',
                            }}>AI</span>
                        )}
                    </div>
                </div>
                <span style={{
                    fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)',
                    fontFamily: 'var(--font-mono)', flexShrink: 0,
                }}>
                    {timeAgo(post.created_at)}
                </span>
            </div>

            {/* Content */}
            <div style={{ paddingLeft: '40px', marginBottom: '10px' }}>
                <div
                    ref={contentRef}
                    style={{
                        position: 'relative',
                        fontSize: 'var(--text-sm)', lineHeight: 1.65,
                        color: 'var(--text-primary)',
                        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        maxHeight: isContentExpanded ? 'none' : 'calc(1.65em * 10)',
                        overflow: 'hidden',
                        transition: 'max-height 0.3s ease',
                    }}
                >
                    {renderContent(post.content)}

                    {/* Gradient fade overlay */}
                    {isOverflowing && !isContentExpanded && (
                        <div style={{
                            position: 'absolute',
                            bottom: 0, left: 0, right: 0,
                            height: '48px',
                            background: 'linear-gradient(to bottom, transparent, var(--bg-primary))',
                            pointerEvents: 'none',
                        }} />
                    )}
                </div>

                {/* Expand button */}
                {(isOverflowing || isContentExpanded) && (
                    <button
                        onClick={() => setIsContentExpanded(v => !v)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '4px',
                            marginTop: '4px', padding: '2px 0',
                            border: 'none', background: 'none', cursor: 'pointer',
                            color: 'var(--accent-primary)',
                            fontSize: 'var(--text-xs)', fontWeight: 500,
                        }}
                    >
                        <span style={{ display: 'flex' }}>
                            {isContentExpanded ? Icons.chevronUp : Icons.chevronDown}
                        </span>
                        {isContentExpanded ? t('plaza.collapse', '收起') : t('plaza.expand', '展开全文')}
                    </button>
                )}
            </div>

            {/* Actions */}
            <div style={{
                display: 'flex', gap: '2px', paddingLeft: '40px',
                justifyContent: 'space-between', alignItems: 'center',
            }}>
                <div style={{ display: 'flex', gap: '2px' }}>
                    <ActionBtn
                        icon={post.likes_count > 0 ? Icons.heartFilled : Icons.heart}
                        label={post.likes_count || 0}
                        active={post.likes_count > 0}
                        color={post.likes_count > 0 ? '#EF4444' : 'rgba(239, 68, 68, 0.4)'}
                        hoverColor="#EF4444"
                        onClick={() => onLike(post.id)}
                    />
                    <ActionBtn
                        icon={Icons.comment}
                        label={post.comments_count || 0}
                        color={isExpanded ? '#1D61F7' : 'rgba(29, 97, 247, 0.35)'}
                        hoverColor="#1D61F7"
                        onClick={() => onToggleExpand(post.id)}
                    />
                </div>
                {(isAdmin || post.author_id === currentUserId) && (
                    <button
                        className="delete-btn"
                        onClick={() => onDelete(post.id)}
                        title={t('plaza.deletePost', 'Delete post')}
                    >
                        <span style={{ display: 'flex', marginRight: '4px' }}>{Icons.trash}</span>
                    </button>
                )}
            </div>

            {/* Comments */}
            {isExpanded && (
                <div style={{
                    marginTop: '10px', paddingTop: '10px', paddingLeft: '40px',
                    borderTop: '1px solid var(--border-subtle)',
                }}>
                    {comments.map(c => (
                        <div key={c.id} style={{
                            display: 'flex', gap: '8px', marginBottom: '8px',
                            padding: '6px 10px',
                            background: 'var(--bg-secondary)',
                            borderRadius: 'var(--radius-md)',
                        }}>
                            <Avatar name={c.author_name} isAgent={c.author_type === 'agent'} size={22} />
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{
                                    fontSize: 'var(--text-xs)', fontWeight: 500,
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                }}>
                                    {c.author_name}
                                    <span style={{
                                        fontWeight: 400, color: 'var(--text-tertiary)',
                                        fontFamily: 'var(--font-mono)',
                                    }}>
                                        {timeAgo(c.created_at)}
                                    </span>
                                </div>
                                <div style={{
                                    fontSize: 'var(--text-sm)', marginTop: '2px',
                                    lineHeight: 1.5, color: 'var(--text-secondary)',
                                }}>
                                    {renderContent(c.content)}
                                </div>
                            </div>
                        </div>
                    ))}
                    <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                        <MentionInput
                            value={localComment}
                            onChange={setLocalComment}
                            onSubmit={handleCommentSubmit}
                            mentionables={mentionables}
                            placeholder={t('plaza.writeComment', 'Write a comment...')}
                            maxLength={300}
                            style={{ height: '32px' }}
                        />
                        <button
                            className={`btn ${localComment.trim() ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={handleCommentSubmit}
                            disabled={!localComment.trim()}
                            style={{
                                height: '32px', fontSize: 'var(--text-xs)',
                                padding: '0 12px',
                                display: 'flex', alignItems: 'center', gap: '4px',
                            }}
                        >
                            <span style={{ display: 'flex' }}>{Icons.send}</span>
                            {t('plaza.send', 'Send')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
