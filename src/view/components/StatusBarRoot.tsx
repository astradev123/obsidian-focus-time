import * as React from 'react';
import { setIcon } from 'obsidian';

export function StatusBarRoot(props: { icon?: string; text: string }) {
    const { icon, text } = props;
    const iconRef = React.useRef<HTMLSpanElement | null>(null);
    React.useEffect(() => {
        if (icon && iconRef.current) {
            setIcon(iconRef.current, icon);
        }
    }, [icon]);
    return (
        <span className="reading-time-text" title={text}>
            {icon ? <span ref={iconRef} aria-hidden /> : null}
            <span>{text}</span>
        </span>
    );
}


