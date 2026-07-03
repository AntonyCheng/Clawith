import { useTranslation } from 'react-i18next';

interface Props {
    /** Rendered height in px (width auto-scales to preserve the 3:1 aspect) */
    height?: number;
    className?: string;
}

/**
 * Clawith brand mark: logo on the left + brand text on the right.
 * - Logo is loaded from /logo.svg (see frontend/public/logo.svg).
 *   Replace that file to change the icon; no code change required.
 * - Brand text is resolved from i18n (app.brand), so it follows the active
 *   language automatically.
 * - Color is controlled by the parent via CSS `color: currentColor`, which
 *   makes Paper Atlas / Night Atlas theme switching automatic.
 */
export default function ClawithWordmark({ height = 28, className }: Props) {
    const { t } = useTranslation();
    const brandName = t('app.brand');

    return (
        <span
            className={className}
            aria-label={brandName}
            role="img"
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                height,
                lineHeight: 1,
                color: 'inherit',
            }}
        >
            <img
                src="/logo-new.jpg"
                alt=""
                style={{ height, width: 'auto', display: 'block', flex: 'none' }}
            />
            <span
                style={{
                    fontFamily:
                        "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
                    fontSize: Math.round(height * 0.62),
                    fontWeight: 700,
                    letterSpacing: '-0.02em',
                    whiteSpace: 'nowrap',
                }}
            >
                {brandName}
            </span>
        </span>
    );
}