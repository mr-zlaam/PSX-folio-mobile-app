import React from "react";
import { Text, View } from "react-native";

type ShariahChipProps = {
  compact?: boolean;
};

export default function ShariahChip({ compact = false }: ShariahChipProps) {
  return (
    <View
      className={[
        "items-center justify-center rounded-full bg-brand-red",
        compact ? "min-h-[10px] px-1 py-0" : "min-h-[11px] px-1.5 py-0",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Text className="text-[7px] font-extrabold uppercase text-brand-white">
        SH
      </Text>
    </View>
  );
}
