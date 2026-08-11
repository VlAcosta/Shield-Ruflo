import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createSubscriptionCheckout,
  downloadPaymentReceipt,
  getSubscriptionPayment,
  getSubscriptionSnapshot,
  persistSubscriptionCart,
  quoteSubscriptionConstructor,
  setSubscriptionAutoRenew,
  validatePromoCode,
} from '../../../services/subscriptions/subscriptionService';
import { createIdempotencyKey } from '../../../services/core/apiClient';
import { formatCurrency } from '../model/formatters';
import { recordCompanyActivity } from '../../../services/activity/companyActivityService';
import { startProTrial as requestProTrial } from '../../../services/subscriptions/subscriptionTrialService';

const EMPTY_PROMO = Object.freeze({
  code: '',
  valid: false,
  percent: 0,
  discount: 0,
});
const PENDING_PAYMENT_KEY = 'business-shield:billing:pending-payment';

export default function useSubscriptions() {
  const [snapshot, setSnapshot] = useState(null);
  const [cart, setCart] = useState({});
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState(EMPTY_PROMO);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState({ renewal: false, promo: false, checkout: false, trial: false });
  const [notice, setNotice] = useState(null);
  const mountedRef = useRef(true);
  const noticeTimerRef = useRef(null);
  const checkoutKeyRef = useRef(null);

  const showNotice = useCallback((message, tone = 'success') => {
    window.clearTimeout(noticeTimerRef.current);
    setNotice({ message, tone, id: Date.now() });
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 3200);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const result = await getSubscriptionSnapshot();
      if (!mountedRef.current) return;
      setSnapshot(result.snapshot);
      setCart(result.cart || {});
    } catch (loadError) {
      if (!mountedRef.current) return;
      setError('Не удалось загрузить данные подписки. Проверьте соединение и повторите попытку.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();

    return () => {
      mountedRef.current = false;
      window.clearTimeout(noticeTimerRef.current);
    };
  }, [load]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const paymentId = window.sessionStorage.getItem(PENDING_PAYMENT_KEY);
    if (!paymentId) return undefined;

    const controller = new AbortController();
    getSubscriptionPayment(paymentId, { refresh: true, signal: controller.signal })
      .then(async (payment) => {
        if (!mountedRef.current || !payment) return;
        if (payment.status === 'succeeded') {
          window.sessionStorage.removeItem(PENDING_PAYMENT_KEY);
          await load();
          showNotice('Оплата подтверждена. Тариф активирован.');
          return;
        }
        if (payment.status === 'canceled' || payment.status === 'failed') {
          window.sessionStorage.removeItem(PENDING_PAYMENT_KEY);
          await load();
          showNotice('Платёж не завершён. Тариф не изменён.', 'warning');
          return;
        }
        await load();
        showNotice('Платёж обрабатывается. Статус обновится после подтверждения банка.', 'neutral');
      })
      .catch((refreshError) => {
        if (refreshError?.name !== 'AbortError') showNotice('Не удалось обновить статус последнего платежа', 'warning');
      });

    return () => controller.abort();
  }, [load, showNotice]);

  const cartItems = useMemo(() => {
    if (!snapshot?.packages) return [];

    return snapshot.packages
      .map((item) => ({
        ...item,
        count: Number(cart[item.id]) || 0,
      }))
      .filter((item) => item.count > 0)
      .map((item) => ({
        ...item,
        total: item.count * item.price,
      }));
  }, [cart, snapshot?.packages]);

  const subtotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.total, 0),
    [cartItems],
  );

  const discount = promo.valid
    ? Math.min(subtotal, Math.round(subtotal * (promo.percent / 100)))
    : 0;
  const total = Math.max(0, subtotal - discount);
  const totalItems = cartItems.reduce((sum, item) => sum + item.count, 0);

  useEffect(() => {
    if (!promo.valid) return;
    setPromo((current) => ({
      ...current,
      discount: Math.round(subtotal * (current.percent / 100)),
    }));
  }, [promo.valid, subtotal]);

  const persistCart = useCallback((nextCart) => {
    if (!snapshot) return;
    persistSubscriptionCart(nextCart, { snapshot, cart: nextCart }).catch(() => {});
  }, [snapshot]);

  const changePackageCount = useCallback((packageId, delta) => {
    setCart((current) => {
      const next = {
        ...current,
        [packageId]: Math.max(0, (Number(current[packageId]) || 0) + delta),
      };
      persistCart(next);
      return next;
    });
  }, [persistCart]);

  const setPackageCount = useCallback((packageId, value) => {
    setCart((current) => {
      const next = {
        ...current,
        [packageId]: Math.max(0, Math.min(99, Number(value) || 0)),
      };
      persistCart(next);
      return next;
    });
  }, [persistCart]);

  const toggleAutoRenew = useCallback(async () => {
    if (!snapshot || busy.renewal) return;

    const previousValue = Boolean(snapshot.plan.autoRenew);
    const nextValue = !previousValue;

    setSnapshot((current) => ({
      ...current,
      plan: { ...current.plan, autoRenew: nextValue },
    }));
    setBusy((current) => ({ ...current, renewal: true }));

    try {
      await setSubscriptionAutoRenew(nextValue, {
        snapshot: {
          ...snapshot,
          plan: { ...snapshot.plan, autoRenew: nextValue },
        },
        cart,
      });
      showNotice(nextValue ? 'Автопродление включено' : 'Автопродление отключено');
      recordCompanyActivity({ type: 'billing_auto_renew', title: nextValue ? 'Включил автопродление' : 'Отключил автопродление', route: '/subscriptions', tone: 'indigo' });
    } catch {
      setSnapshot((current) => ({
        ...current,
        plan: { ...current.plan, autoRenew: previousValue },
      }));
      showNotice('Не удалось изменить автопродление', 'error');
    } finally {
      if (mountedRef.current) setBusy((current) => ({ ...current, renewal: false }));
    }
  }, [busy.renewal, cart, showNotice, snapshot]);

  const applyPromo = useCallback(async () => {
    const normalized = promoInput.trim();

    if (!normalized) {
      setPromo(EMPTY_PROMO);
      showNotice('Введите промокод', 'warning');
      return;
    }

    setBusy((current) => ({ ...current, promo: true }));

    try {
      const result = await validatePromoCode(normalized, subtotal);

      if (!result.valid) {
        setPromo(EMPTY_PROMO);
        showNotice('Промокод не найден или больше не действует', 'error');
        return;
      }

      setPromo(result);
      setPromoInput(result.code);
      showNotice(`Промокод применён · скидка ${result.percent}%`);
    } catch {
      showNotice('Не удалось проверить промокод', 'error');
    } finally {
      if (mountedRef.current) setBusy((current) => ({ ...current, promo: false }));
    }
  }, [promoInput, showNotice, subtotal]);

  const removePromo = useCallback(() => {
    setPromoInput('');
    setPromo(EMPTY_PROMO);
    showNotice('Промокод удалён', 'neutral');
  }, [showNotice]);

  const runCheckout = useCallback(async (payload, activityTitle) => {
    if (busy.checkout) return null;
    setBusy((current) => ({ ...current, checkout: true }));

    if (!checkoutKeyRef.current) checkoutKeyRef.current = createIdempotencyKey('subscription-checkout');

    try {
      const result = await createSubscriptionCheckout(payload, { idempotencyKey: checkoutKeyRef.current });
      if (!result?.ok) {
        showNotice(result?.message || 'Онлайн-оплата сейчас недоступна', 'error');
        return result;
      }

      if (result.paymentId && typeof window !== 'undefined') {
        window.sessionStorage.setItem(PENDING_PAYMENT_KEY, result.paymentId);
      }

      recordCompanyActivity({
        type: 'billing_checkout',
        title: activityTitle,
        detail: result.amount ? formatCurrency(result.amount) : undefined,
        route: '/subscriptions',
        tone: 'violet',
      });

      checkoutKeyRef.current = null;

      if (result.redirectUrl) {
        window.location.assign(result.redirectUrl);
        return result;
      }

      if (result.status === 'succeeded') {
        if (typeof window !== 'undefined') window.sessionStorage.removeItem(PENDING_PAYMENT_KEY);
        await load();
        showNotice('Оплата подтверждена. Тариф активирован.');
        return result;
      }

      await load();
      showNotice('Платёж создан и ожидает подтверждения.', 'neutral');
      return result;
    } catch (checkoutError) {
      showNotice(checkoutError?.message || 'Не удалось перейти к оплате. Попробуйте ещё раз.', 'error');
      return null;
    } finally {
      if (mountedRef.current) setBusy((current) => ({ ...current, checkout: false }));
    }
  }, [busy.checkout, load, showNotice]);

  const checkoutPlan = useCallback((planCode = 'PRO') => (
    runCheckout({ kind: 'plan', planCode }, `Начал оплату тарифа ${planCode}`)
  ), [runCheckout]);

  const checkoutConstructor = useCallback((selection) => (
    runCheckout({ kind: 'constructor', selection }, 'Начал оплату индивидуального тарифа')
  ), [runCheckout]);

  const quoteConstructor = useCallback((selection, options) => (
    quoteSubscriptionConstructor(selection, options)
  ), []);

  const startTrial = useCallback(async () => {
    if (busy.trial || !snapshot?.trial?.available) return;
    setBusy((current) => ({ ...current, trial: true }));
    try {
      const nextSnapshot = await requestProTrial();
      setSnapshot(nextSnapshot);
      setCart({});
      showNotice('PRO активирован на 14 дней');
      recordCompanyActivity({ type: 'billing_trial', title: 'Активировал PRO на 14 дней', route: '/subscriptions', tone: 'violet' });
    } catch (trialError) {
      showNotice(trialError?.message || 'Не удалось активировать пробный период', 'error');
    } finally {
      if (mountedRef.current) setBusy((current) => ({ ...current, trial: false }));
    }
  }, [busy.trial, showNotice, snapshot?.trial?.available]);

  const downloadReceipt = useCallback(async (payment) => {
    if (!payment?.receiptAvailable) {
      showNotice('Квитанция для этой операции пока недоступна', 'neutral');
      return;
    }
    try {
      await downloadPaymentReceipt(payment);
      showNotice('Квитанция загружена', 'neutral');
    } catch {
      showNotice('Не удалось скачать квитанцию', 'error');
    }
  }, [showNotice]);

  return {
    snapshot,
    cart,
    cartItems,
    subtotal,
    discount,
    total,
    totalItems,
    promoInput,
    promo,
    loading,
    error,
    busy,
    notice,
    setPromoInput,
    changePackageCount,
    setPackageCount,
    toggleAutoRenew,
    applyPromo,
    removePromo,
    checkoutPlan,
    checkoutConstructor,
    quoteConstructor,
    startTrial,
    downloadReceipt,
    reload: load,
  };
}
