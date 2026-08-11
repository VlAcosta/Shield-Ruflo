import React, { memo } from 'react';
import Button from '../../../components/ui/Button';
import CurrentPlan from '../CurrentPlan';
import PlanLimits from '../PlanLimits';
import PackageStore from '../PackageStore';
import SubscriptionCart from '../SubscriptionCart';
import PaymentHistory from '../PaymentHistory';
import useSubscriptions from '../hooks/useSubscriptions';
import './SubscriptionsWorkspace.scss';
import './SubscriptionsRecovery.scss';
import useAccessControl from '../../access/hooks/useAccessControl';

function SubscriptionSkeleton() {
  return (
    <div className="subscriptions-skeleton" aria-label="Загрузка подписки">
      <div className="subscriptions-skeleton__top">
        <span className="subscriptions-skeleton__hero" />
        <span className="subscriptions-skeleton__limits" />
      </div>
      <span className="subscriptions-skeleton__store" />
    </div>
  );
}

function SubscriptionsWorkspace() {
  const subscription = useSubscriptions();
  const access = useAccessControl();
  const canManage = access.can('billing.manage');

  if (subscription.loading) return <SubscriptionSkeleton />;

  if (subscription.error || !subscription.snapshot) {
    return (
      <section className="subscriptions-error">
        <div className="subscriptions-error__mark">!</div>
        <div><h2>Подписка временно недоступна</h2><p>{subscription.error || 'Не удалось получить данные подписки.'}</p></div>
        <Button onClick={subscription.reload}>Повторить</Button>
      </section>
    );
  }

  const {
    plan,
    limits,
    packages = [],
    payments = [],
    trial,
    paymentProviderConfigured,
    availablePlans = [],
  } = subscription.snapshot;
  const proPlan = availablePlans.find((item) => item.code === 'PRO');

  return (
    <div className="subscriptions-workspace subscriptions-workspace--recovered">
      <div className="subscriptions-workspace__top">
        <CurrentPlan
          plan={plan}
          renewalBusy={subscription.busy.renewal}
          onToggleRenewal={subscription.toggleAutoRenew}
          canManage={canManage && Boolean(paymentProviderConfigured)}
        />
        <PlanLimits limits={limits} />
      </div>

      {canManage && trial?.available ? (
        <section className="subscriptions-trial">
          <div>
            <span>PRO · {trial.days || 14} дней бесплатно</span>
            <h2>Попробуйте полный Бизнес Щит</h2>
            <p>AI-функции, расширенные лимиты и инструменты роста активируются сразу. Карта не нужна, автосписания не будет.</p>
            {proPlan ? <strong>{Number(proPlan.price || 0).toLocaleString('ru-RU')} ₽ / месяц после подключения оплаты</strong> : null}
          </div>
          <Button onClick={subscription.startTrial} disabled={subscription.busy.trial}>
            {subscription.busy.trial ? 'Активируем…' : 'Активировать PRO на 14 дней'}
          </Button>
        </section>
      ) : null}

      {!paymentProviderConfigured ? (
        <section className="subscriptions-payment-note">
          <div><strong>Онлайн-оплата пока не подключена</strong><span>Текущий тариф и лимиты работают. Для тестирования PRO используйте бесплатный период; фиктивные платежи мы не показываем.</span></div>
        </section>
      ) : null}

      {canManage && paymentProviderConfigured && packages.length ? (
        <>
          <PackageStore packages={packages} cart={subscription.cart} onChangeCount={subscription.changePackageCount} onSetCount={subscription.setPackageCount} />
          <SubscriptionCart items={subscription.cartItems} subtotal={subscription.subtotal} discount={subscription.discount} total={subscription.total} totalItems={subscription.totalItems} promoInput={subscription.promoInput} promo={subscription.promo} promoBusy={subscription.busy.promo} checkoutBusy={subscription.busy.checkout} onPromoChange={subscription.setPromoInput} onApplyPromo={subscription.applyPromo} onRemovePromo={subscription.removePromo} onCheckout={subscription.checkout} />
        </>
      ) : null}

      {!canManage ? <section className="subscriptions-workspace__read-only"><strong>Подписка доступна только для просмотра</strong><span>Изменение тарифа ограничено вашей ролью.</span></section> : null}

      {payments.length ? <PaymentHistory payments={payments} onDownload={subscription.downloadReceipt} /> : null}

      {subscription.notice ? (
        <div className={`subscriptions-toast subscriptions-toast--${subscription.notice.tone}`} role="status" key={subscription.notice.id}>
          <span />{subscription.notice.message}
        </div>
      ) : null}
    </div>
  );
}

export default memo(SubscriptionsWorkspace);
