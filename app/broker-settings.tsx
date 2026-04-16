import React from "react";
import { useGuardedRouter } from "@/src/lib/navigation";
import { ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import AppButton from "@/components/ui/app-button";
import AppBackIconButton from "@/components/ui/app-back-icon-button";
import AppFeedbackModal, {
  AppFeedbackModalTone,
} from "@/components/ui/app-feedback-modal";
import {
  BrokerProfileMode,
  getBrokerSettings,
  getDefaultBrokerSettings,
  setBrokerSettings,
} from "@/src/lib/app-preferences";
import {
  BrokerCommissionModel,
  BrokerCommissionRule,
  BrokerCommissionRuleType,
  DEFAULT_BROKER_COMMISSION_PCT,
  DEFAULT_CDC_CHARGE_PER_SHARE,
  DEFAULT_SST_RATE_PCT,
  normalizeBrokerCommissionRuleType,
} from "@/src/lib/broker-fee";
import { APP_COLORS } from "@/src/theme/colors";

type BrokerSettingsNotice = {
  title: string;
  message: string;
  tone: AppFeedbackModalTone;
};

type RuleDraft = {
  id: string;
  minSharePriceInput: string;
  maxSharePriceInput: string;
  type: BrokerCommissionRuleType;
  percentageRateInput: string;
  perShareChargeInput: string;
  fixedChargeInput: string;
};

function createRuleDraft(rule?: BrokerCommissionRule): RuleDraft {
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  const ruleId =
    typeof rule?.id === "string" && rule.id.trim().length > 0
      ? rule.id
      : `rule_${Date.now()}_${randomSuffix}`;
  return {
    id: ruleId,
    minSharePriceInput:
      typeof rule?.minSharePrice === "number" && Number.isFinite(rule.minSharePrice)
        ? String(rule.minSharePrice)
        : "0",
    maxSharePriceInput:
      typeof rule?.maxSharePrice === "number" && Number.isFinite(rule.maxSharePrice)
        ? String(rule.maxSharePrice)
        : "",
    type: rule ? normalizeBrokerCommissionRuleType(rule.type) : "percentage",
    percentageRateInput:
      typeof rule?.percentageRate === "number" && Number.isFinite(rule.percentageRate)
        ? String(rule.percentageRate)
        : "",
    perShareChargeInput:
      typeof rule?.perShareCharge === "number" && Number.isFinite(rule.perShareCharge)
        ? String(rule.perShareCharge)
        : "",
    fixedChargeInput:
      typeof rule?.fixedCharge === "number" && Number.isFinite(rule.fixedCharge)
        ? String(rule.fixedCharge)
        : "",
  };
}

function ModeChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      className={[
        "rounded-xl px-3 py-2",
        selected
          ? "bg-app-highlight dark:bg-app-highlightDark"
          : "bg-brand-white/70 dark:bg-brand-white/5",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Text
        className={[
          "text-xs font-bold uppercase tracking-wide",
          selected
            ? "text-brand-white dark:text-brand-purple"
            : "text-app-highlight dark:text-app-highlightDark",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function parseNonNegativeInput(value: string): number | null {
  const normalized = value.trim().replace(/,/g, "");
  if (normalized.length === 0) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function formatPkrValue(value: number): string {
  return Number.isFinite(value)
    ? value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")
    : "0";
}

function buildRulesFromDrafts(ruleDrafts: RuleDraft[]): {
  rules: BrokerCommissionRule[];
  errorMessage: string | null;
} {
  const parsedRulesWithIndex: {
    rule: BrokerCommissionRule;
    index: number;
  }[] = [];

  for (let index = 0; index < ruleDrafts.length; index += 1) {
    const draft = ruleDrafts[index];
    const ruleLabel = `Rule ${index + 1}`;
    const minSharePrice = parseNonNegativeInput(draft.minSharePriceInput);
    if (minSharePrice === null) {
      return {
        rules: [],
        errorMessage: `${ruleLabel}: enter a valid "From Price" (0 or above).`,
      };
    }

    const maxInput = draft.maxSharePriceInput.trim().replace(/,/g, "");
    let maxSharePrice: number | null = null;
    if (maxInput.length > 0) {
      const parsedMax = Number(maxInput);
      if (!Number.isFinite(parsedMax) || parsedMax < minSharePrice) {
        return {
          rules: [],
          errorMessage: `${ruleLabel}: "To Price" must be empty or greater than/equal to "From Price".`,
        };
      }
      maxSharePrice = parsedMax;
    }

    const normalizedType = normalizeBrokerCommissionRuleType(draft.type);
    const percentageRate = parseNonNegativeInput(draft.percentageRateInput);
    const perShareCharge = parseNonNegativeInput(draft.perShareChargeInput);
    const fixedCharge = parseNonNegativeInput(draft.fixedChargeInput);

    if (normalizedType === "percentage" && percentageRate === null) {
      return {
        rules: [],
        errorMessage: `${ruleLabel}: enter a valid commission percentage.`,
      };
    }
    if (normalizedType === "perShare" && perShareCharge === null) {
      return {
        rules: [],
        errorMessage: `${ruleLabel}: enter a valid per-share charge.`,
      };
    }
    if (normalizedType === "fixedOrder" && fixedCharge === null) {
      return {
        rules: [],
        errorMessage: `${ruleLabel}: enter a valid fixed charge.`,
      };
    }
    if (
      normalizedType === "maxPercentageOrPerShare" &&
      (percentageRate === null || perShareCharge === null)
    ) {
      return {
        rules: [],
        errorMessage: `${ruleLabel}: enter both percentage and per-share values.`,
      };
    }

    parsedRulesWithIndex.push({
      index,
      rule: {
        id: draft.id,
        minSharePrice,
        maxSharePrice,
        type: normalizedType,
        percentageRate,
        perShareCharge,
        fixedCharge,
      },
    });
  }

  const sortedRules = [...parsedRulesWithIndex].sort(
    (firstRule, secondRule) => firstRule.rule.minSharePrice - secondRule.rule.minSharePrice
  );

  for (let index = 1; index < sortedRules.length; index += 1) {
    const previousRule = sortedRules[index - 1];
    const currentRule = sortedRules[index];
    const previousMax = previousRule.rule.maxSharePrice ?? Number.POSITIVE_INFINITY;
    if (currentRule.rule.minSharePrice <= previousMax) {
      return {
        rules: [],
        errorMessage: `Rule ${previousRule.index + 1} overlaps with Rule ${currentRule.index + 1}. Adjust price ranges.`,
      };
    }
  }

  return {
    rules: parsedRulesWithIndex.map((entry) => entry.rule),
    errorMessage: null,
  };
}

export default function BrokerSettingsScreen() {
  const router = useGuardedRouter();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const placeholderTextColor = isDarkMode
    ? APP_COLORS.text.placeholderDark
    : APP_COLORS.text.placeholderLight;

  const [profileMode, setProfileMode] = React.useState<BrokerProfileMode>("default");
  const [commissionModel, setCommissionModel] =
    React.useState<BrokerCommissionModel>("flat");
  const [brokerCommissionInput, setBrokerCommissionInput] = React.useState(
    String(DEFAULT_BROKER_COMMISSION_PCT)
  );
  const [cdcChargeInput, setCdcChargeInput] = React.useState(
    String(DEFAULT_CDC_CHARGE_PER_SHARE)
  );
  const [ruleDrafts, setRuleDrafts] = React.useState<RuleDraft[]>([
    createRuleDraft(),
  ]);
  const [isSaving, setIsSaving] = React.useState(false);
  const [notice, setNotice] = React.useState<BrokerSettingsNotice | null>(null);

  React.useEffect(() => {
    let isMounted = true;

    async function hydrateBrokerSettings() {
      const savedBrokerSettings = await getBrokerSettings();
      const effectiveSettings = savedBrokerSettings ?? getDefaultBrokerSettings();
      if (!isMounted) {
        return;
      }

      setProfileMode(effectiveSettings.profileMode);
      setBrokerCommissionInput(String(effectiveSettings.transactionFeeValue));
      setCdcChargeInput(String(effectiveSettings.cdcChargePerShare));
      const shouldUseSlabs =
        effectiveSettings.profileMode === "custom" &&
        effectiveSettings.commissionModel === "slabs" &&
        effectiveSettings.commissionRules.length > 0;
      setCommissionModel(shouldUseSlabs ? "slabs" : "flat");
      setRuleDrafts(
        shouldUseSlabs
          ? effectiveSettings.commissionRules.map((rule) => createRuleDraft(rule))
          : [createRuleDraft()]
      );
    }

    void hydrateBrokerSettings();

    return () => {
      isMounted = false;
    };
  }, []);

  const showNotice = React.useCallback(
    (title: string, message: string, tone: AppFeedbackModalTone = "info") => {
      setNotice({
        title,
        message,
        tone,
      });
    },
    []
  );

  const effectiveBrokerCommissionPct = React.useMemo(() => {
    if (profileMode === "default") {
      return DEFAULT_BROKER_COMMISSION_PCT;
    }

    const parsedValue = Number(brokerCommissionInput.trim().replace(/,/g, ""));
    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
      return 0;
    }

    return parsedValue;
  }, [brokerCommissionInput, profileMode]);

  const effectiveCdcChargePerShare = React.useMemo(() => {
    if (profileMode === "default") {
      return DEFAULT_CDC_CHARGE_PER_SHARE;
    }

    const parsedValue = Number(cdcChargeInput.trim().replace(/,/g, ""));
    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
      return 0;
    }

    return parsedValue;
  }, [cdcChargeInput, profileMode]);

  const updateRuleDraft = React.useCallback(
    (ruleId: string, patch: Partial<RuleDraft>) => {
      setRuleDrafts((previousRules) =>
        previousRules.map((ruleDraft) =>
          ruleDraft.id === ruleId ? { ...ruleDraft, ...patch } : ruleDraft
        )
      );
    },
    []
  );

  const handleAddRule = React.useCallback(() => {
    setRuleDrafts((previousRules) => [...previousRules, createRuleDraft()]);
  }, []);

  const handleRemoveRule = React.useCallback((ruleId: string) => {
    setRuleDrafts((previousRules) => {
      if (previousRules.length <= 1) {
        return previousRules;
      }
      return previousRules.filter((ruleDraft) => ruleDraft.id !== ruleId);
    });
  }, []);

  const handleSaveBrokerSettings = React.useCallback(async () => {
    let normalizedCommissionPct = DEFAULT_BROKER_COMMISSION_PCT;
    let normalizedCdcChargePerShare = DEFAULT_CDC_CHARGE_PER_SHARE;
    let normalizedCommissionModel: BrokerCommissionModel = "flat";
    let normalizedCommissionRules: BrokerCommissionRule[] = [];

    if (profileMode === "custom") {
      const parsedCdcChargePerShare = Number(cdcChargeInput.trim().replace(/,/g, ""));
      if (!Number.isFinite(parsedCdcChargePerShare) || parsedCdcChargePerShare < 0) {
        showNotice(
          "Invalid CDC Charges",
          "Enter a valid CDC amount per share (0 or above).",
          "error"
        );
        return;
      }
      normalizedCdcChargePerShare = parsedCdcChargePerShare;

      if (commissionModel === "slabs") {
        const builtRules = buildRulesFromDrafts(ruleDrafts);
        if (builtRules.errorMessage) {
          showNotice("Invalid Slab Rules", builtRules.errorMessage, "error");
          return;
        }
        normalizedCommissionModel = "slabs";
        normalizedCommissionRules = builtRules.rules;
      } else {
        const parsedCommissionPct = Number(
          brokerCommissionInput.trim().replace(/,/g, "")
        );
        if (!Number.isFinite(parsedCommissionPct) || parsedCommissionPct < 0) {
          showNotice(
            "Invalid Broker Charges",
            "Enter a valid broker commission percentage (0 or above).",
            "error"
          );
          return;
        }
        normalizedCommissionPct = parsedCommissionPct;
      }
    }

    setIsSaving(true);
    try {
      await setBrokerSettings({
        brokerName: profileMode === "custom" ? "Custom Broker" : "Default Broker",
        profileMode,
        transactionFeeType: "percentage",
        transactionFeeValue: normalizedCommissionPct,
        cdcChargePerShare: normalizedCdcChargePerShare,
        commissionModel: normalizedCommissionModel,
        commissionRules: normalizedCommissionRules,
      });
      showNotice(
        "Broker Settings Saved",
        "Broker fee rules are now active for all new trades.",
        "success"
      );
    } catch {
      showNotice(
        "Save Failed",
        "Could not save broker settings right now. Please try again.",
        "error"
      );
    } finally {
      setIsSaving(false);
    }
  }, [
    brokerCommissionInput,
    cdcChargeInput,
    commissionModel,
    profileMode,
    ruleDrafts,
    showNotice,
  ]);

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      className="flex-1 bg-app-bg dark:bg-app-bgDark"
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingTop: 14,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-5">
          <View className="flex-row items-center justify-between">
            <AppBackIconButton onPress={() => router.back()} />

            <Text className="text-2xl font-extrabold text-app-text dark:text-app-textDark">
              Broker Settings
            </Text>

            <View className="w-14" />
          </View>

          <View className="rounded-3xl bg-brand-white/95 p-4 shadow-md shadow-app-highlight/30 dark:shadow-none dark:bg-brand-white/10">
            <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
              Broker Profile
            </Text>
            <Text className="mt-2 text-sm font-semibold text-app-text dark:text-app-textDark">
              Configure exactly how commission, SST, and CDC should be applied.
            </Text>

            <View className="mt-4 gap-3">
              <View>
                <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                  Profile Mode
                </Text>
                <View className="mt-1 flex-row gap-2">
                  <ModeChip
                    label="Default"
                    selected={profileMode === "default"}
                    onPress={() => setProfileMode("default")}
                  />
                  <ModeChip
                    label="Custom"
                    selected={profileMode === "custom"}
                    onPress={() => setProfileMode("custom")}
                  />
                </View>
              </View>

              {profileMode === "custom" ? (
                <View>
                  <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                    Commission Mode
                  </Text>
                  <View className="mt-1 flex-row gap-2">
                    <ModeChip
                      label="Flat %"
                      selected={commissionModel === "flat"}
                      onPress={() => setCommissionModel("flat")}
                    />
                    <ModeChip
                      label="Slabs"
                      selected={commissionModel === "slabs"}
                      onPress={() => setCommissionModel("slabs")}
                    />
                  </View>
                </View>
              ) : null}

              {profileMode === "custom" && commissionModel === "flat" ? (
                <View>
                  <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                    Broker Commission %
                  </Text>
                  <TextInput
                    value={brokerCommissionInput}
                    onChangeText={setBrokerCommissionInput}
                    editable={profileMode === "custom"}
                    placeholder="e.g. 0.15"
                    placeholderTextColor={placeholderTextColor}
                    keyboardType="numeric"
                    className="mt-1 rounded-xl bg-app-highlight/10 px-3 py-2 text-sm font-semibold text-app-text dark:bg-brand-white/8 dark:text-app-textDark"
                  />
                </View>
              ) : null}

              {profileMode === "custom" && commissionModel === "slabs" ? (
                <View className="gap-3">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                    Slab Rules (per share price)
                  </Text>

                  {ruleDrafts.map((ruleDraft, ruleIndex) => (
                    <View
                      key={ruleDraft.id}
                      className="rounded-2xl bg-brand-white/70 px-3 py-3 dark:bg-brand-white/5"
                    >
                      <View className="flex-row items-center justify-between">
                        <Text className="text-xs font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                          Rule {ruleIndex + 1}
                        </Text>
                        {ruleDrafts.length > 1 ? (
                          <TouchableOpacity
                            activeOpacity={0.88}
                            onPress={() => handleRemoveRule(ruleDraft.id)}
                            className="rounded-lg bg-brand-red/15 px-2 py-1"
                          >
                            <Text className="text-xs font-bold text-brand-red">
                              Remove
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>

                      <View className="mt-3 flex-row gap-2">
                        <View className="flex-1">
                          <Text className="text-[11px] font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                            From Price
                          </Text>
                          <TextInput
                            value={ruleDraft.minSharePriceInput}
                            onChangeText={(nextValue) =>
                              updateRuleDraft(ruleDraft.id, {
                                minSharePriceInput: nextValue,
                              })
                            }
                            keyboardType="numeric"
                            placeholder="0"
                            placeholderTextColor={placeholderTextColor}
                            className="mt-1 rounded-xl bg-app-highlight/10 px-3 py-2 text-sm font-semibold text-app-text dark:bg-brand-white/8 dark:text-app-textDark"
                          />
                        </View>

                        <View className="flex-1">
                          <Text className="text-[11px] font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                            To Price
                          </Text>
                          <TextInput
                            value={ruleDraft.maxSharePriceInput}
                            onChangeText={(nextValue) =>
                              updateRuleDraft(ruleDraft.id, {
                                maxSharePriceInput: nextValue,
                              })
                            }
                            keyboardType="numeric"
                            placeholder="Leave empty for open-ended"
                            placeholderTextColor={placeholderTextColor}
                            className="mt-1 rounded-xl bg-app-highlight/10 px-3 py-2 text-sm font-semibold text-app-text dark:bg-brand-white/8 dark:text-app-textDark"
                          />
                        </View>
                      </View>

                      <View className="mt-3">
                        <Text className="text-[11px] font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                          Rule Type
                        </Text>
                        <View className="mt-1 flex-row flex-wrap gap-2">
                          <ModeChip
                            label="% Value"
                            selected={ruleDraft.type === "percentage"}
                            onPress={() =>
                              updateRuleDraft(ruleDraft.id, {
                                type: "percentage",
                              })
                            }
                          />
                          <ModeChip
                            label="/ Share"
                            selected={ruleDraft.type === "perShare"}
                            onPress={() =>
                              updateRuleDraft(ruleDraft.id, {
                                type: "perShare",
                              })
                            }
                          />
                          <ModeChip
                            label="Fixed"
                            selected={ruleDraft.type === "fixedOrder"}
                            onPress={() =>
                              updateRuleDraft(ruleDraft.id, {
                                type: "fixedOrder",
                              })
                            }
                          />
                          <ModeChip
                            label="Max(% vs /share)"
                            selected={ruleDraft.type === "maxPercentageOrPerShare"}
                            onPress={() =>
                              updateRuleDraft(ruleDraft.id, {
                                type: "maxPercentageOrPerShare",
                              })
                            }
                          />
                        </View>
                      </View>

                      {ruleDraft.type === "percentage" ||
                      ruleDraft.type === "maxPercentageOrPerShare" ? (
                        <View className="mt-3">
                          <Text className="text-[11px] font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                            Percentage %
                          </Text>
                          <TextInput
                            value={ruleDraft.percentageRateInput}
                            onChangeText={(nextValue) =>
                              updateRuleDraft(ruleDraft.id, {
                                percentageRateInput: nextValue,
                              })
                            }
                            keyboardType="numeric"
                            placeholder="e.g. 0.15"
                            placeholderTextColor={placeholderTextColor}
                            className="mt-1 rounded-xl bg-app-highlight/10 px-3 py-2 text-sm font-semibold text-app-text dark:bg-brand-white/8 dark:text-app-textDark"
                          />
                        </View>
                      ) : null}

                      {ruleDraft.type === "perShare" ||
                      ruleDraft.type === "maxPercentageOrPerShare" ? (
                        <View className="mt-3">
                          <Text className="text-[11px] font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                            Charge / Share (PKR)
                          </Text>
                          <TextInput
                            value={ruleDraft.perShareChargeInput}
                            onChangeText={(nextValue) =>
                              updateRuleDraft(ruleDraft.id, {
                                perShareChargeInput: nextValue,
                              })
                            }
                            keyboardType="numeric"
                            placeholder="e.g. 0.05"
                            placeholderTextColor={placeholderTextColor}
                            className="mt-1 rounded-xl bg-app-highlight/10 px-3 py-2 text-sm font-semibold text-app-text dark:bg-brand-white/8 dark:text-app-textDark"
                          />
                        </View>
                      ) : null}

                      {ruleDraft.type === "fixedOrder" ? (
                        <View className="mt-3">
                          <Text className="text-[11px] font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                            Fixed Charge (PKR)
                          </Text>
                          <TextInput
                            value={ruleDraft.fixedChargeInput}
                            onChangeText={(nextValue) =>
                              updateRuleDraft(ruleDraft.id, {
                                fixedChargeInput: nextValue,
                              })
                            }
                            keyboardType="numeric"
                            placeholder="e.g. 50"
                            placeholderTextColor={placeholderTextColor}
                            className="mt-1 rounded-xl bg-app-highlight/10 px-3 py-2 text-sm font-semibold text-app-text dark:bg-brand-white/8 dark:text-app-textDark"
                          />
                        </View>
                      ) : null}
                    </View>
                  ))}

                  <TouchableOpacity
                    activeOpacity={0.88}
                    onPress={handleAddRule}
                    className="rounded-xl bg-app-highlight/12 px-3 py-3 dark:bg-brand-white/8"
                  >
                    <Text className="text-center text-sm font-bold text-app-highlight dark:text-app-highlightDark">
                      + Add Slab Rule
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <View>
                <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                  CDC (PKR / Share)
                </Text>
                <TextInput
                  value={
                    profileMode === "default"
                      ? String(DEFAULT_CDC_CHARGE_PER_SHARE)
                      : cdcChargeInput
                  }
                  onChangeText={setCdcChargeInput}
                  editable={profileMode === "custom"}
                  placeholder="e.g. 0.005"
                  placeholderTextColor={placeholderTextColor}
                  keyboardType="numeric"
                  className={[
                    "mt-1 rounded-xl px-3 py-2 text-sm font-semibold",
                    profileMode === "custom"
                      ? "bg-app-highlight/10 text-app-text dark:bg-brand-white/8 dark:text-app-textDark"
                      : "bg-brand-white/70 text-app-text/55 dark:bg-brand-white/12 dark:text-app-textDark/55",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
              </View>

              <View className="rounded-2xl bg-brand-white/70 px-3 py-3 dark:bg-brand-white/5">
                <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                  Effective Rules
                </Text>
                <View className="mt-2 gap-2">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs font-semibold text-app-text dark:text-app-textDark">
                      Commission Mode
                    </Text>
                    <Text className="text-xs font-bold text-app-text dark:text-app-textDark">
                      {profileMode === "default"
                        ? "Default Flat %"
                        : commissionModel === "slabs"
                          ? `${ruleDrafts.length} Slab Rule(s)`
                          : "Flat %"}
                    </Text>
                  </View>
                  {profileMode !== "default" && commissionModel === "flat" ? (
                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs font-semibold text-app-text dark:text-app-textDark">
                        Broker Commission
                      </Text>
                      <Text className="text-xs font-bold text-app-text dark:text-app-textDark">
                        {effectiveBrokerCommissionPct}%
                      </Text>
                    </View>
                  ) : null}
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs font-semibold text-app-text dark:text-app-textDark">
                      SST on Commission
                    </Text>
                    <Text className="text-xs font-bold text-app-text dark:text-app-textDark">
                      {DEFAULT_SST_RATE_PCT}%
                    </Text>
                  </View>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs font-semibold text-app-text dark:text-app-textDark">
                      CDC (Per Share)
                    </Text>
                    <Text className="text-xs font-bold text-app-text dark:text-app-textDark">
                      PKR {formatPkrValue(effectiveCdcChargePerShare)}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            <View className="mt-5">
              <AppButton
                label="Save Broker Settings"
                variant="primary"
                loading={isSaving}
                onPress={handleSaveBrokerSettings}
              />
            </View>
          </View>
        </View>
      </ScrollView>

      <AppFeedbackModal
        visible={notice !== null}
        title={notice?.title ?? ""}
        message={notice?.message ?? ""}
        tone={notice?.tone ?? "info"}
        actionLabel="Done"
        onClose={() => setNotice(null)}
      />
    </SafeAreaView>
  );
}
