import * as React from 'react';
import FocusTimePlugin from "../../main";
import I18n from "../../language/i18n";
import { TimeUtils } from "../../util/timeUtils";
import { StatisticsView } from "./StatisticsView";
import { setIcon } from "obsidian";

type ViewType = 'leaderboard' | 'statistics';

export function DashboardRoot(props: { plugin: FocusTimePlugin; onSelect: (filePath: string) => void }) {
    const { plugin, onSelect } = props;
    const [viewType, setViewType] = React.useState<ViewType>('statistics');
    const [sidebarOpen, setSidebarOpen] = React.useState(false);
    const overlayRef = React.useRef<HTMLDivElement>(null);
    const toggleIconRef = React.useRef<HTMLSpanElement>(null);

    React.useEffect(() => {
        if (toggleIconRef.current) {
            setIcon(toggleIconRef.current, 'menu');
        }
    }, []);

    const handleViewChange = (view: ViewType) => {
        setViewType(view);
        setSidebarOpen(false);
    };

    const toggleSidebar = () => {
        setSidebarOpen(!sidebarOpen);
    };

    const closeSidebar = () => {
        setSidebarOpen(false);
    };

    function SidebarButton(props: { icon: string; label: string; active: boolean; onClick: () => void }) {
        const iconRef = React.useRef<HTMLSpanElement>(null);
        
        React.useEffect(() => {
            if (iconRef.current) {
                setIcon(iconRef.current, props.icon);
            }
        }, [props.icon]);

        return (
            <button 
                className={`sidebar-button ${props.active ? 'active' : ''}`}
                onClick={props.onClick}
            >
                <span className="sidebar-button-icon" ref={iconRef}></span>
                <span>{props.label}</span>
            </button>
        );
    }

    return (
        <div className="focus-time-modal-container">
            <button className="sidebar-toggle" onClick={toggleSidebar}>
                <span className="sidebar-toggle-icon" ref={toggleIconRef}></span>
                <span>{I18n.t('menu')}</span>
            </button>
            <div 
                className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
                onClick={closeSidebar}
                ref={overlayRef}
            ></div>
            <div className={`focus-time-sidebar ${sidebarOpen ? 'open' : ''}`}>
                <h2 className="sidebar-title">{I18n.t('focusTimeTitle')}</h2>
                <SidebarButton 
                    icon="bar-chart-3" 
                    label={I18n.t('statistics')} 
                    active={viewType === 'statistics'} 
                    onClick={() => handleViewChange('statistics')} 
                />
                <SidebarButton 
                    icon="trophy" 
                    label={I18n.t('leaderboard')} 
                    active={viewType === 'leaderboard'} 
                    onClick={() => handleViewChange('leaderboard')} 
                />
            </div>
            
            <div className="focus-time-content">
                {viewType === 'statistics' && <StatisticsView plugin={plugin} onSelect={onSelect} />}
                {viewType === 'leaderboard' && <LeaderboardView plugin={plugin} onSelect={onSelect} />}
            </div>
        </div>
    );
}

function LeaderboardView(props: { plugin: FocusTimePlugin; onSelect: (filePath: string) => void }) {
    const { plugin, onSelect } = props;
    const leaderboardData = plugin.dataAnalyzer.analyzeLeaderboardTotal();

    if (!leaderboardData || leaderboardData.length === 0) {
        return (
            <div>
                <h2 className="leaderboard-modal-title">{I18n.t('leaderboardTitle')}</h2>
                <p className="leaderboard-no-data">{I18n.t('leaderboardNoData')}</p>
                <p className="leaderboard-no-data">{I18n.t('leaderboardNoData2')}</p>
            </div>
        );
    }

    return (
        <div>
            <h2 className="leaderboard-modal-title">{I18n.t('leaderboardTitle')}</h2>
            <div className="leaderboard-container">
                {leaderboardData.map((item: any, index: number) => {
                    const formattedReadTime = TimeUtils.getFormattedReadingTime(item.totalTime);
                    const noteName = getFormattedNoteName(item.filePath);
                    return (
                        <div
                            key={item.filePath}
                            className="leaderboard-entry"
                            onClick={() => onSelect(item.fileRecord.filePath)}
                        >
                            <div className="leaderboard-left">
                                <div className="leaderboard-file-name" title={item.filePath}>{`${index + 1}. ${noteName}`}</div>
                                <div className="leaderboard-file-path" title={item.filePath}>{item.filePath}</div>
                            </div>
                            <span className="leaderboard-time">{formattedReadTime}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function getFormattedNoteName(filePath: string) {
    const noteName = filePath.split("/").pop() ?? "";
    if (noteName.length > 25) {
        return noteName.substring(0, 25) + "...";
    } else {
        return noteName;
    }
}


