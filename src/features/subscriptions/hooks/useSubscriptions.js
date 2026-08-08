import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createSubscriptionCheckout,
  downloadPaymentReceipt,
  getSubscriptionSnapshot,
  persistSubscriptionCart,
  setSubscriptionAutoRenew,
  validatePromoCode,
} from '../../../services/subscriptions/subscriptionService';
import { formatCurrency } from '../model/formatters';
import { recordCompanyActivity } from '../../../services/activity/companyActivityService';

const EMPTY_PROMO = Object.freeze({
  code: '',
  valid: false,
  percent: 0,
  discount: 0,
});

export default function useSubscriptions() {
  const [snapshot, setSnapshot] = useState(null);
  const [cart, setCart] = useState({});
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState(EMPTY_PROMO);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState({ renewal: false, promo: false, checkout: false });
  const [notice, setNotice] = useState(null);
  const mountedRef = useRef(true);
  const noticeTimerRef = useRef(null);

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

  const checkout = useCallback(async () => {
    if (!cartItems.length || busy.checkout) return;

    setBusy((current) => ({ ...current, checkout: true }));

    try {
      const result = await createSubscriptionCheckout({
        items: cartItems.map(({ id, count, price }) => ({ id, count, price })),
        promoCode: promo.valid ? promo.code : null,
        subtotal,
        discount,
        total,
      });

      if (result?.redirectUrl) {
        window.location.assign(result.redirectUrl);
        return;
      }

      showNotice(`Заказ на ${formatCurrency(total)} сформирован`);
      recordCompanyActivity({ type: 'billing_checkout', title: `Сформировал заказ на ${formatCurrency(total)}`, detail: `${totalItems} поз.`, route: '/subscriptions', tone: 'violet' });
      const cleared = Object.fromEntries(Object.keys(cart).map((id) => [id, 0]));
      setCart(cleared);
      setPromoInput('');
      setPromo(EMPTY_PROMO);
      persistCart(cleared);
    } catch {
      showNotice('Не удалось перейти к оплате. Попробуйте ещё раз.', 'error');
    } finally {
      if (mountedRef.current) setBusy((current) => ({ ...current, checkout: false }));
    }
  }, [busy.checkout, cart, cartItems, discount, persistCart, promo, showNotice, subtotal, total, totalItems]);

  const downloadReceipt = useCallback(async (payment) => {
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
    checkout,
    downloadReceipt,
    reload: load,
  };
}
