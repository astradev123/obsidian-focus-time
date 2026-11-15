import * as React from 'react';
import { setIcon } from 'obsidian';

interface StatusBarRootProps {
    icon?: string;
    text: string;
    title?: string;
}

export function StatusBarRoot(props: StatusBarRootProps) {
    const { icon, text, title } = props;
    const iconRef = React.useRef<HTMLSpanElement | null>(null);
    React.useEffect(() => {
        if (icon && iconRef.current) {
            setIcon(iconRef.current, icon);
        }
    }, [icon]);
    return (
        <span className="reading-time-text" title={title ?? text}>
            {icon ? <span ref={iconRef} aria-hidden /> : null}
            <span>{text}</span>
        </span>
    );
}
