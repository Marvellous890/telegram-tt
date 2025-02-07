import type { FC, TeactNode } from '../../lib/teact/teact';
import React, { memo } from '../../lib/teact/teact';

import type { MenuItemContextAction } from './ListItem';

import buildClassName from '../../util/buildClassName';
import renderText from '../common/helpers/renderText';

import { useFastClick } from '../../hooks/useFastClick';

import FolderIcon from '../common/FolderIcon';

import './VerticalTab.scss';

type OwnProps = {
  className?: string;
  title: TeactNode;
  isActive?: boolean;
  badgeCount?: number;
  isBadgeActive?: boolean;
  onClick?: (arg: number) => void;
  clickArg?: number;
  contextActions?: MenuItemContextAction[];
  contextRootElementSelector?: string;
};

const classNames = {
  active: 'Tab--active',
  badgeActive: 'Tab__badge--active',
};

const VerticalTab: FC<OwnProps> = ({
  title,
  badgeCount,
  isBadgeActive,
  onClick,
  clickArg,
}) => {
  if (title === 'All') title += ' chats';

  const { handleClick, handleMouseDown } = useFastClick((/* e: React.MouseEvent<HTMLDivElement> */) => {
    onClick?.(clickArg!);
  });

  return (
    <div
      className="vertical-tab"
      onClick={handleClick}
      onMouseDown={handleMouseDown}
    >
      <FolderIcon />
      <span className="title">{typeof title === 'string' ? renderText(title) : title}</span>
      {Boolean(badgeCount) && (
        <span className={buildClassName('badge', isBadgeActive && classNames.badgeActive)}>{badgeCount}</span>
      )}
    </div>
  );
};

export default memo(VerticalTab);
