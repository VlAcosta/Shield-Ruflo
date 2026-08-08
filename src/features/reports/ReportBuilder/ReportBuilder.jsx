import React, { memo } from 'react';
import Button from '../../../components/ui/Button';
import { BUILDER_PERIODS } from '../model/reportData';
import { CheckIcon, SparkIcon } from '../model/icons';
import './ReportBuilder.scss';

function ReportBuilder({ builder, activeBlocks, generating, onPeriodChange, onCustomChange, onToggleBlock, onGenerate }) {
  return (
    <div className="report-builder">
      <section className="report-builder__controls">
        <div className="report-builder__head">
          <span>Конструктор отчёта</span>
          <h2>Соберите отчёт под задачу</h2>
          <p>Выберите период и нужные разделы — структура предпросмотра обновится сразу.</p>
        </div>

        <div className="report-builder__section">
          <div className="report-builder__label">Период</div>
          <div className="report-builder__periods">
            {BUILDER_PERIODS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={builder.period === item.id ? 'is-active' : ''}
                onClick={() => onPeriodChange(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {builder.period === 'custom' ? (
            <div className="report-builder__dates">
              <label><span>С</span><input type="date" value={builder.customFrom} onChange={(event) => onCustomChange('customFrom', event.target.value)} /></label>
              <label><span>По</span><input type="date" value={builder.customTo} onChange={(event) => onCustomChange('customTo', event.target.value)} /></label>
            </div>
          ) : null}
        </div>

        <div className="report-builder__section">
          <div className="report-builder__label-row"><span className="report-builder__label">Блоки отчёта</span><small>{activeBlocks.length} выбрано</small></div>
          <div className="report-builder__blocks">
            {builder.blocks.map((item, index) => (
              <button
                type="button"
                className={`report-builder__block report-builder__block--${item.tone} ${item.enabled ? 'is-enabled' : ''}`}
                key={item.id}
                onClick={() => onToggleBlock(item.id)}
                style={{ '--builder-index': index }}
                aria-pressed={item.enabled}
              >
                <span className="report-builder__check">{item.enabled ? <CheckIcon /> : null}</span>
                <span className="report-builder__block-copy"><strong>{item.label}</strong><small>{item.description}</small></span>
              </button>
            ))}
          </div>
        </div>

        <Button className="report-builder__submit" onClick={onGenerate} disabled={!activeBlocks.length || generating}>
          <SparkIcon /> {generating ? 'Формируем...' : 'Сформировать отчёт'}
        </Button>
      </section>

      <section className="report-builder__preview">
        <div className="report-builder__preview-head">
          <div><span>Предпросмотр</span><strong>{activeBlocks.length} разделов</strong></div>
          <span className="report-builder__live"><i/> Live</span>
        </div>

        <div className="report-builder__sheet">
          <div className="report-builder__sheet-brand">БИЗНЕС <strong>ЩИТ</strong></div>
          <div className="report-builder__sheet-hero"><span>Аналитический отчёт</span><strong>{BUILDER_PERIODS.find((item) => item.id === builder.period)?.label || 'Период'}</strong></div>

          <div className="report-builder__sheet-grid">
            {activeBlocks.map((item, index) => (
              <article className={`report-builder__preview-block report-builder__preview-block--${item.tone}`} key={item.id} style={{ '--preview-index': index }}>
                <div><span/><strong>{item.label}</strong></div>
                <i/><i/><i/>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export default memo(ReportBuilder);
