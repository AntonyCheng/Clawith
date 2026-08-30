import { useState } from 'react';

interface UserAvatarProps {
    name: string;
    size?: number;
    src?: string | null;
    title?: string;
}

/**
 * Compact circular avatar with graceful fallback.
 *
 * - `src` provided and loads successfully -> renders a <img>.
 * - `src` missing or fails to load   -> renders the first character of `name`
 *   on a neutral background.
 *
 * Visuals intentionally stay neutral so it slots into both the sidebar
 * footer and dense list rows. The original red brand-colored chip lives
 * inside <Avatar> in PostCard for agent avatars.
 */
export default function UserAvatar({
    name,
    size = 32,
    src,
    title,
}: UserAvatarProps) {
    const initial = (Array.from(name || '?')[0] || '?').toUpperCase();
    const [imgFailed, setImgFailed] = useState(false);
    const showImage = Boolean(src) && !imgFailed;

    const baseStyle: React.CSSProperties = {
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: 'var(--radius-md)',
        flexShrink: 0,
        userSelect: 'none',
        overflow: 'hidden',
    };

    if (showImage) {
        return (
            <img
                src={src as string}
                alt={initial}
                title={title ?? name}
                onError={() => setImgFailed(true)}
                style={{
                    ...baseStyle,
                    display: 'block',
                    objectFit: 'cover',
                    background: 'var(--bg-tertiary)',
                }}
            />
        );
    }

    return (
        <div
            title={title ?? name}
            style={{
                ...baseStyle,
                background: '#E60012',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontSize: `${Math.max(10, Math.round(size * 0.4))}px`,
                fontWeight: 600,
                boxShadow: '0 6px 12px rgba(230, 0, 18, 0.16)',
            }}
        >
            {initial}
        </div>
    );
}
