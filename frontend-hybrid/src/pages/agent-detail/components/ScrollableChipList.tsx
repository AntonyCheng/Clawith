import { useRef, useState, useEffect } from 'react';

interface Props {
    children: React.ReactNode;
}

const ScrollableChipList = ({ children }: Props) => {
    const ref = useRef<HTMLDivElement | null>(null);
    const [edge, setEdge] = useState<'start' | 'end' | 'middle'>('start');

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const update = () => {
            const { scrollLeft, scrollWidth, clientWidth } = el;
            if (scrollLeft <= 1 && scrollWidth - clientWidth <= 1) {
                setEdge('start'); // 内容不溢出
            } else if (scrollLeft + clientWidth >= scrollWidth - 1) {
                setEdge('end');
            } else {
                setEdge('middle');
            }
        };

        update();
        el.addEventListener('scroll', update, { passive: true });
        const ro = new ResizeObserver(update);
        ro.observe(el);

        return () => {
            el.removeEventListener('scroll', update);
            ro.disconnect();
        };
    }, []);

    return (
        <div ref={ref} className={`agent-info-chip-list agent-info-chip-list--${edge}`}>
            {children}
        </div>
    );
};

export default ScrollableChipList;