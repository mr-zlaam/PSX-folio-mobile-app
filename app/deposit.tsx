import React from "react";
import {
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useGuardedRouter } from "@/src/lib/navigation";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import AppButton from "@/components/ui/app-button";
import AppBackIconButton from "@/components/ui/app-back-icon-button";
import AppFeedbackModal from "@/components/ui/app-feedback-modal";
import { formatPKRAmount } from "@/src/features/home/home-formatters";
import {
  getDepositRecordById,
  saveDepositRecord,
  updateDepositRecord,
} from "@/src/features/deposit/deposit-records";
import { APP_COLORS } from "@/src/theme/colors";

type DateTimePickerMode = "date" | "time";

function formatDateTimeInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function parsePositiveNumber(value: string): number {
  const parsed = Number(value.trim().replace(/,/g, ""));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return parsed;
}

function formatEditableAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "";
  }

  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(2);
}

export default function DepositScreen() {
  const router = useGuardedRouter();
  const searchParams = useLocalSearchParams<{
    editDepositId?: string | string[];
  }>();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const inputPlaceholderTextColor = isDarkMode
    ? APP_COLORS.text.placeholderDark
    : APP_COLORS.text.placeholderLight;
  const [amountInput, setAmountInput] = React.useState("");
  const [noteInput, setNoteInput] = React.useState("");
  const [depositedAt, setDepositedAt] = React.useState(new Date());
  const [pickerMode, setPickerMode] = React.useState<DateTimePickerMode>("date");
  const [isPickerVisible, setIsPickerVisible] = React.useState(false);
  const [isAwaitingTimeSelection, setIsAwaitingTimeSelection] =
    React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [shouldGoBackAfterNotice, setShouldGoBackAfterNotice] =
    React.useState(false);
  const [notice, setNotice] = React.useState<{
    title: string;
    message: string;
    tone: "success" | "error" | "info";
  } | null>(null);
  const normalizedEditDepositId = React.useMemo(() => {
    const rawEditDepositId = Array.isArray(searchParams.editDepositId)
      ? searchParams.editDepositId[0]
      : searchParams.editDepositId;
    return (rawEditDepositId ?? "").trim();
  }, [searchParams.editDepositId]);
  const isEditingDeposit = normalizedEditDepositId.length > 0;

  const cardClassName =
    "rounded-3xl bg-brand-white/95 p-4 shadow-md shadow-app-highlight/25 dark:shadow-none dark:bg-brand-white/10";
  const fieldClassName =
    "mt-1 rounded-xl border border-app-text/10 bg-brand-white/90 px-3 py-2 text-sm font-semibold text-app-text dark:border-app-highlightDark/20 dark:bg-brand-white/10 dark:text-app-textDark";
  const pickerTriggerClassName =
    "mt-1 rounded-xl border border-app-text/10 bg-brand-white/90 px-3 py-2 dark:border-app-highlightDark/20 dark:bg-brand-white/10";
  const pickerSheetClassName =
    "mt-3 rounded-xl border border-app-text/10 bg-brand-white/90 p-2 dark:border-app-highlightDark/20 dark:bg-brand-white/10";

  const parsedAmount = React.useMemo(() => parsePositiveNumber(amountInput), [amountInput]);

  React.useEffect(() => {
    let isMounted = true;
    if (!isEditingDeposit) {
      return () => {
        isMounted = false;
      };
    }

    async function loadDepositForEdit() {
      const existingDeposit = await getDepositRecordById(normalizedEditDepositId);
      if (!isMounted) {
        return;
      }

      if (!existingDeposit) {
        setNotice({
          title: "Deposit Not Found",
          message: "This deposit record was not found. It may have been removed.",
          tone: "error",
        });
        return;
      }

      setAmountInput(formatEditableAmount(existingDeposit.amount));
      setNoteInput(existingDeposit.note ?? "");
      const parsedDate = new Date(existingDeposit.depositedAt);
      setDepositedAt(Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate);
    }

    void loadDepositForEdit();
    return () => {
      isMounted = false;
    };
  }, [isEditingDeposit, normalizedEditDepositId]);

  const handleStartDateTimeSelection = React.useCallback(() => {
    setPickerMode("date");
    setIsAwaitingTimeSelection(false);
    setIsPickerVisible(true);
  }, []);

  const handleDateTimeChange = React.useCallback(
    (event: DateTimePickerEvent, selectedValue?: Date) => {
      if (event.type === "dismissed" || !selectedValue) {
        setIsPickerVisible(false);
        setIsAwaitingTimeSelection(false);
        setPickerMode("date");
        return;
      }

      if (pickerMode === "date") {
        setDepositedAt((currentValue) => {
          const nextValue = new Date(currentValue);
          nextValue.setFullYear(
            selectedValue.getFullYear(),
            selectedValue.getMonth(),
            selectedValue.getDate()
          );
          return nextValue;
        });

        setPickerMode("time");
        setIsAwaitingTimeSelection(true);

        if (Platform.OS === "android") {
          setIsPickerVisible(false);
          setTimeout(() => {
            setIsPickerVisible(true);
          }, 0);
        }
        return;
      }

      setDepositedAt((currentValue) => {
        const nextValue = new Date(currentValue);
        nextValue.setHours(selectedValue.getHours(), selectedValue.getMinutes());
        return nextValue;
      });

      setIsPickerVisible(false);
      setIsAwaitingTimeSelection(false);
      setPickerMode("date");
    },
    [pickerMode]
  );

  const showNotice = React.useCallback(
    (title: string, message: string, tone: "success" | "error" | "info") => {
      setNotice({ title, message, tone });
    },
    []
  );

  const handleCloseNotice = React.useCallback(() => {
    setNotice(null);
    if (shouldGoBackAfterNotice) {
      setShouldGoBackAfterNotice(false);
      router.back();
    }
  }, [router, shouldGoBackAfterNotice]);

  const handleSaveDeposit = React.useCallback(async () => {
    if (parsedAmount <= 0) {
      showNotice("Invalid Amount", "Please enter amount greater than 0.", "error");
      return;
    }

    setIsSubmitting(true);
    setShouldGoBackAfterNotice(false);
    try {
      const savedDeposit = isEditingDeposit
        ? await updateDepositRecord(normalizedEditDepositId, {
            amount: parsedAmount,
            depositedAt: depositedAt.toISOString(),
            note: noteInput.trim().length > 0 ? noteInput.trim() : null,
          })
        : await saveDepositRecord({
            amount: parsedAmount,
            depositedAt: depositedAt.toISOString(),
            note: noteInput.trim().length > 0 ? noteInput.trim() : null,
          });

      showNotice(
        isEditingDeposit ? "Deposit Updated" : "Deposit Added",
        `Deposit ${formatPKRAmount(savedDeposit.amount)} ${
          isEditingDeposit ? "updated" : "added"
        } successfully.`,
        "success"
      );

      if (isEditingDeposit) {
        setShouldGoBackAfterNotice(true);
      } else {
        setAmountInput("");
        setNoteInput("");
        setDepositedAt(new Date());
      }
    } catch {
      showNotice(
        isEditingDeposit ? "Update Failed" : "Save Failed",
        isEditingDeposit
          ? "Could not update deposit. Please try again."
          : "Could not save deposit. Please try again.",
        "error"
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    depositedAt,
    noteInput,
    parsedAmount,
    showNotice,
    isEditingDeposit,
    normalizedEditDepositId,
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
              {isEditingDeposit ? "Edit Deposit" : "Add Deposit"}
            </Text>

            <View className="w-14" />
          </View>

          <View className={cardClassName}>
            <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
              Deposit Form
            </Text>

            <View className="mt-4 gap-3">
              <View>
                <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                  Amount
                </Text>
                <TextInput
                  value={amountInput}
                  onChangeText={setAmountInput}
                  placeholder="e.g. 10000"
                  placeholderTextColor={inputPlaceholderTextColor}
                  keyboardType="numeric"
                  className={fieldClassName}
                />
              </View>

              <View>
                <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                  Note (Optional)
                </Text>
                <TextInput
                  value={noteInput}
                  onChangeText={setNoteInput}
                  placeholder="Optional note"
                  placeholderTextColor={inputPlaceholderTextColor}
                  className={fieldClassName}
                />
              </View>

              <View>
                <Text className="text-xs font-semibold uppercase tracking-wide text-app-text dark:text-app-textDark">
                  Date & Time
                </Text>
                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={handleStartDateTimeSelection}
                  className={pickerTriggerClassName}
                >
                  <Text className="text-sm font-semibold text-app-text dark:text-app-textDark">
                    {formatDateTimeInput(depositedAt)}
                  </Text>
                </TouchableOpacity>

                {isPickerVisible ? (
                  <View className={pickerSheetClassName}>
                    <Text className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
                      {isAwaitingTimeSelection ? "Pick Time" : "Pick Date"}
                    </Text>
                    <DateTimePicker
                      key={pickerMode}
                      value={depositedAt}
                      mode={pickerMode}
                      display="default"
                      onChange={handleDateTimeChange}
                    />
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          <View className={cardClassName}>
            <Text className="text-sm font-bold uppercase tracking-wide text-app-highlight dark:text-app-highlightDark">
              Preview
            </Text>
            <Text className="mt-2 text-2xl font-extrabold text-success-green">
              {formatPKRAmount(parsedAmount)}
            </Text>
          </View>

          <AppButton
            label={isEditingDeposit ? "Update Deposit" : "Save Deposit"}
            variant="primary"
            loading={isSubmitting}
            onPress={handleSaveDeposit}
          />
        </View>
      </ScrollView>

      <AppFeedbackModal
        visible={notice !== null}
        title={notice?.title ?? ""}
        message={notice?.message ?? ""}
        tone={notice?.tone ?? "info"}
        actionLabel="Done"
        onClose={handleCloseNotice}
      />
    </SafeAreaView>
  );
}
