# P25 production hold

Do not deploy this branch directly until its migration lineage is reconciled with the current production release.

Production already contains migration `20260811225000_production_ux_billing_recovery`, which is not present in the P25 branch lineage as of the previous production pin.

The next production candidate must preserve the current production UX/billing migration lineage and then layer P18–P25 changes on top before P26 begins.
