import React, { memo } from 'react';
import Button from '../../../components/ui/Button';
import CurrentPlan from '../CurrentPlan';
import PlanLimits from '../PlanLimits';
import PackageStore from '../PackageStore';
import SubscriptionCart from '../SubscriptionCart';
import PaymentHistory from '../PaymentHistory';
import useSubscriptions from '../hooks/useSubscriptions';
import './SubscriptionsWorkspace.scss';
import useAccessControl from '../../access/hooks/useAccessControl';

function SubscriptionSkeleton() {
  return (
    <div className="subscriptions-skeleton" aria-label="Загрузка подписки">
      <div className="subscriptions-skeleton__top">
        <span className="subscriptions-skeleton__hero" />
        <span className="subscriptions-skeleton__limits" />
      </div>
      <span className="subscriptions-skeleton__store" />
      <span className="subscriptions-skeleton__history" />
    </div>
  );
}

function SubscriptionsWorkspace() {
  const subscription = useSubscriptions();
  const access = useAccessControl();
  const canManage = access.can('billing.manage');

  if (subscription.loading) {
    return <SubscriptionSkeleton />;
  }

  if (subscription.error || !subscription.snapshot) {
    return (
      <section className="subscriptions-error">
        <div className="subscriptions-error__mark">!</div>
        <div>
          <h2>Подписка временно недоступна</h2>
          <p>{subscription.error || 'Не удалось получить данные подписки.'}</p>
        </div>
        <Button onClick={subscription.reload}>Повторить</Button>
      </section>
    );
  }

  const { plan, limits, packages, payments } = subscription.snapshot;

  return (
    <div className="subscriptions-workspace">
      <div className="subscriptions-workspace__top">
        <CurrentPlan
          plan={plan}
          renewalBusy={subscription.busy.renewal}
          onToggleRenewal={subscription.toggleAutoRenew}
          canManage={canManage}
        />
        <PlanLimits limits={limits} />
      </div>

      {canManage ? <>
        <PackageStore packages={packages} cart={subscription.cart} onChangeCount={subscription.changePackageCount} onSetCount={subscription.setPackageCount} />
        <SubscriptionCart items={subscription.cartItems} subtotal={subscription.subtotal} discount={subscription.discount} total={subscription.total} totalItems={subscription.totalItems} promoInput={subscription.promoInput} promo={subscription.promo} promoBusy={subscription.busy.promo} checkoutBusy={subscription.busy.checkout} onPromoChange={subscription.setPromoInput} onApplyPromo={subscription.applyPromo} onRemovePromo={subscription.removePromo} onCheckout={subscription.checkout} />
      </> : <section className="subscriptions-workspace__read-only"><strong>Подписка доступна только для просмотра</strong><span>Изменение тарифа, пакетов и автопродления ограничено вашей ролью.</span></section>}

      <PaymentHistory
        payments={payments}
        onDownload={subscription.downloadReceipt}
      />

      {subscription.notice ? (
        <div
          className={`subscriptions-toast subscriptions-toast--${subscription.notice.tone}`}
          role="status"
          key={subscription.notice.id}
        >
          <span />
          {subscription.notice.message}
        </div>
      ) : null}
    </div>
  );
}

export default memo(SubscriptionsWorkspace);
