/**
 * Dashboard 三 Tab 共用图标
 */

import React from 'react';

const stroke = {
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
};

export const DashboardIcons = {
    users: (
        <svg width="18" height="18" viewBox="0 0 18 18" {...stroke}>
            <circle cx="7" cy="6" r="2.5" />
            <path d="M2 16v-1a4 4 0 018 0v1" />
            <circle cx="12.5" cy="6" r="2" />
            <path d="M16 16v-.5a3.5 3.5 0 00-3.5-3.5" />
        </svg>
    ),
    cost: (
        <svg width="18" height="18" viewBox="0 0 18 18" {...stroke}>
            <circle cx="9" cy="9" r="7" />
            <path d="M9 5v8M11 7H7.5a1.5 1.5 0 000 3h3a1.5 1.5 0 010 3H6" />
        </svg>
    ),
    value: (
        <svg width="18" height="18" viewBox="0 0 18 18" {...stroke}>
            <path d="M9 2l2 4 4 .5-3 3 1 4.5-4-2-4 2 1-4.5-3-3 4-.5z" />
        </svg>
    ),
};