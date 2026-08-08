import React, {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import './PeriodMenu.scss';

function ChevronIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4.5 6.25L8 9.75L11.5 6.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function PeriodMenu({
  value,
  options,
  onChange,
  ariaLabel = 'Выбрать период',
  variant = 'default',
  align = 'right',
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState(null);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  const selected = useMemo(
    () => options.find((option) => option.value === value) || options[0],
    [options, value]
  );

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === 'undefined') return;

    const rect = trigger.getBoundingClientRect();
    const width = 190;
    const viewportPadding = 10;
    const gap = 7;
    const estimatedHeight = Math.min(320, Math.max(64, options.length * 51 + 12));
    const hasSpaceBelow = window.innerHeight - rect.bottom >= estimatedHeight + gap + viewportPadding;
    const top = hasSpaceBelow
      ? rect.bottom + gap
      : Math.max(viewportPadding, rect.top - estimatedHeight - gap);

    const preferredLeft = align === 'left' ? rect.left : rect.right - width;
    const left = clamp(preferredLeft, viewportPadding, window.innerWidth - width - viewportPadding);

    setPopoverStyle({
      position: 'fixed',
      top: `${Math.round(top)}px`,
      left: `${Math.round(left)}px`,
      width: `${width}px`,
      '--period-origin': hasSpaceBelow ? 'top' : 'bottom',
    });
  }, [align, options.length]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      const insideTrigger = rootRef.current?.contains(event.target);
      const insidePopover = popoverRef.current?.contains(event.target);
      if (!insideTrigger && !insidePopover) setOpen(false);
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    const handleViewportChange = () => updatePosition();

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [open, updatePosition]);

  const handleSelect = useCallback((nextValue) => {
    onChange(nextValue);
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, [onChange]);

  const popover = open && popoverStyle && typeof document !== 'undefined' ? createPortal(
    <div
      ref={popoverRef}
      className={`period-menu__popover period-menu__popover--portal period-menu__popover--${variant}`}
      role="listbox"
      aria-label={ariaLabel}
      style={popoverStyle}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            className={`period-menu__option ${active ? 'is-active' : ''}`}
            type="button"
            role="option"
            aria-selected={active}
            key={option.value}
            onClick={() => handleSelect(option.value)}
          >
            <span>
              <strong>{option.label}</strong>
              {option.caption ? <small>{option.caption}</small> : null}
            </span>
            <i aria-hidden="true" />
          </button>
        );
      })}
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <div
        ref={rootRef}
        className={`period-menu period-menu--${variant} period-menu--${align} ${open ? 'is-open' : ''} ${className}`.trim()}
      >
        <button
          ref={triggerRef}
          className="period-menu__trigger"
          type="button"
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <span>{selected?.label}</span>
          <ChevronIcon />
        </button>
      </div>
      {popover}
    </>
  );
}

export default memo(PeriodMenu);
