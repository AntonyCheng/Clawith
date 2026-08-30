import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { fileApi } from '../../../services/api';
import { fetchAuth } from '../utils/fetchAuth';
import type { FileItem } from '../../../components/FileBrowser';
import ScrollableChipList from './ScrollableChipList';

interface AgentTool {
    id?: string | number;
    name?: string;
    display_name?: string;
    enabled?: boolean;
    source?: string;
    category?: string;
}

interface Props {
    agentId: string;
}

const ToolsSkillsSummary = ({ agentId }: Props) => {
    const { t } = useTranslation();

    // Tools — independent fetch; ToolsManager uses raw fetch + useState today,
    // so this is the second source of truth. Acceptable for a side-panel summary.
    const { data: toolsData } = useQuery<AgentTool[]>({
        queryKey: ['tools', agentId, 'with-config'],
        queryFn: () => fetchAuth<AgentTool[]>(`/tools/agents/${agentId}/with-config`),
        enabled: !!agentId,
    });

    // Skills — matches the queryKey SkillsTab invalidates, so installs/deletes
    // are reflected automatically without an extra refetch.
    const { data: skillsData } = useQuery<FileItem[]>({
        queryKey: ['files', agentId, 'skills'],
        queryFn: () => fileApi.list(agentId, 'skills'),
        enabled: !!agentId,
    });

    const enabledTools = (toolsData ?? [])
        .filter(tool => tool.enabled !== false && tool.category !== 'system')
        .map(tool => (tool.display_name || tool.name || '').trim())
        .filter(Boolean);

    const skillNames = (skillsData ?? [])
        .filter(item => item.is_dir)
        .map(item => item.name)
        .filter(Boolean);

    if (enabledTools.length === 0 && skillNames.length === 0) {
        return null;
    }

    return (
        <div className="agent-info-tools-skills">
            {enabledTools.length > 0 && (
                <div className="agent-info-capability-block">
                    <div className="agent-info-capability-title">
                        {t('agent.tabs.tools', 'Tools')}
                        <span className="agent-info-capability-count">· {enabledTools.length}</span>
                    </div>
                    <ScrollableChipList>
                        {enabledTools.map((label, idx) => (
                            <span className="agent-info-chip" key={`${label}-${idx}`} title={label}>
                                {label}
                            </span>
                        ))}
                    </ScrollableChipList>
                </div>
            )}
            {skillNames.length > 0 && (
                <div className="agent-info-capability-block">
                    <div className="agent-info-capability-title">
                        {t('agent.tabs.skills', 'Skills')}
                        <span className="agent-info-capability-count">· {skillNames.length}</span>
                    </div>
                    <ScrollableChipList>
                        {skillNames.map(name => (
                            <span className="agent-info-chip" key={name} title={name}>
                                {name}
                            </span>
                        ))}
                    </ScrollableChipList>
                </div>
            )}
        </div>
    );
};

export default ToolsSkillsSummary;