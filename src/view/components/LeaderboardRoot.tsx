import * as React from 'react';
import FocusTimePlugin from "../../main";
import I18n from "../../language/i18n";
import { TimeUtils } from "../../util/timeUtils";

export function LeaderboardRoot(props: { plugin: FocusTimePlugin; onSelect: (filePath: string) => void }) {
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


