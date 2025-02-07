import type { FC, TeactNode } from '../../lib/teact/teact';
import React, { memo, useRef } from '../../lib/teact/teact';

import type { MenuItemContextAction } from './ListItem';

import buildClassName from '../../util/buildClassName';
import renderText from '../common/helpers/renderText';

import useContextMenuHandlers from '../../hooks/useContextMenuHandlers';
import { useFastClick } from '../../hooks/useFastClick';
import useLastCallback from '../../hooks/useLastCallback';

import FolderIcon from '../common/FolderIcon';

import './VerticalTab.scss';
import Menu from "./Menu";
import MenuSeparator from "./MenuSeparator";
import MenuItem from "./MenuItem";
import {MouseButton} from "../../util/windowEnvironment";

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
  isActive,
  onClick,
  clickArg,
  contextActions,
  contextRootElementSelector,
}) => {
  if (title === 'All') title += ' chats';

  // eslint-disable-next-line no-null/no-null
  const tabRef = useRef<HTMLDivElement>(null);

  const { handleClick, handleMouseDown } = useFastClick((e: React.MouseEvent<HTMLDivElement>) => {
    if (contextActions && (e.button === MouseButton.Secondary || !onClick)) {
      handleBeforeContextMenu(e);
    }

    if (e.type === 'mousedown' && e.button !== MouseButton.Main) {
      return;
    }
    onClick?.(clickArg!);
  });

  const {
    contextMenuAnchor, handleContextMenu, handleBeforeContextMenu, handleContextMenuClose,
    handleContextMenuHide, isContextMenuOpen,
  } = useContextMenuHandlers(tabRef, !contextActions);

  const getTriggerElement = useLastCallback(() => tabRef.current);
  const getRootElement = useLastCallback(
    () => (contextRootElementSelector ? tabRef.current!.closest(contextRootElementSelector) : document.body),
  );
  const getMenuElement = useLastCallback(
    () => document.querySelector('#portals')!.querySelector('.Tab-context-menu .bubble'),
  );
  const getLayout = useLastCallback(() => ({ withPortal: true }));

  return (
    <div
      className="vertical-tab"
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
      ref={tabRef}
    >
      <FolderIcon isActive={isActive} />
      <span className={buildClassName('title', isActive && 'title--active')}>{typeof title === 'string' ? renderText(title) : title}</span>
      {Boolean(badgeCount) && (
        <span className={buildClassName('badge', isBadgeActive && classNames.badgeActive)}>{badgeCount}</span>
      )}

      {contextActions && contextMenuAnchor !== undefined && (
        <Menu
          isOpen={isContextMenuOpen}
          anchor={contextMenuAnchor}
          getTriggerElement={getTriggerElement}
          getRootElement={getRootElement}
          getMenuElement={getMenuElement}
          getLayout={getLayout}
          className="Tab-context-menu"
          autoClose
          onClose={handleContextMenuClose}
          onCloseAnimationEnd={handleContextMenuHide}
          withPortal
        >
          {contextActions.map((action) => (
            ('isSeparator' in action) ? (
              <MenuSeparator key={action.key || 'separator'} />
            ) : (
              <MenuItem
                key={action.title}
                icon={action.icon}
                destructive={action.destructive}
                disabled={!action.handler}
                onClick={action.handler}
              >
                {action.title}
              </MenuItem>
            )
          ))}
        </Menu>
      )}
    </div>
  );
};

export default memo(VerticalTab);
