import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import Select, {
    components,
    type StylesConfig,
    type SelectComponentsConfig,
    type GroupBase
} from "react-select";

import BaseDropdownOption from "./BaseDropdownOption";

import DropdownSettingProps from "./DropdownSettingProps";
import * as styles from "./DropdownSetting.module.css";

const defaultStyles = {
    dropdown: {
        width: "200px",
        backgroundColor: "var(--ui-shade-5)",
        border: "none",
        borderRadius: "10px",
        cursor: "pointer",
        transitionDuration: "0.3s"
    },
    menu: {
        width: "200px",
        zIndex: 100000,
        backgroundColor: "var(--ui-shade-4)",
        color: "white"
    },
    option: {
        backgroundColor: "rgba(0, 0, 0, 0)",
        transitionDuration: "0.3s"
    }
};

function DropdownSetting<Option extends BaseDropdownOption>(
    props: DropdownSettingProps<Option>
) {
    const { t } = useTranslation("common");

    function getMenuOffset() {
        const dropdownWidth = (
            props.dropdownStyle?.width || defaultStyles.dropdown.width
        );
        const menuWidth = props.menuStyle?.width || defaultStyles.menu.width;

        if (props.menuAlignment == "left") {
            return "0px";
        } else if (props.menuAlignment == "center") {
            return `calc((${dropdownWidth} / 2) - (${menuWidth} / 2))`;
        } else {
            return `calc((${menuWidth} * -1) + ${dropdownWidth})`;
        }
    }

    function getLabel(option: BaseDropdownOption) {
        return option.label || t("error");
    }

    // react-select rebuilds its internal component tree whenever the
    // components prop changes identity, unmounting/remounting the control
    // and menu on every parent re-render (engine evaluations, ad resizes).
    // A remount strands MenuPortal's cached control element on a detached
    // node: its next measurement reads rect(0,0) and the menu pins to the
    // screen corner, and the remount itself flickers the menu. Memoize on
    // the effective inputs so plain re-renders keep stable identities.
    // ponytail: dropdownLabelRenderer is dropped by JSON.stringify, so a
    // renderer whose behaviour (not just identity) changes stays stale.
    const selectInputs = JSON.stringify([
        props.menuAlignment, props.menuPositionStrategy,
        props.dropdownClassName, props.dropdownArrowClassName,
        props.dropdownLabelClassName, props.menuClassName, props.optionClassName,
        props.dropdownStyle, props.menuStyle, props.optionStyle,
        props.dropdownLabelStyle, props.dropdownArrowStyle,
        props.dropdownLabelRenderer
    ]);

    const selectStyles = useMemo<StylesConfig<Option, false>>(() => ({
        control: baseStyles => ({
            ...baseStyles,
            ...defaultStyles.dropdown,
            ...props.dropdownStyle
        }),
        dropdownIndicator: baseStyles => ({
            ...baseStyles,
            ...props.dropdownArrowStyle
        }),
        singleValue: baseStyles => ({
            ...baseStyles,
            display: "flex",
            alignItems: "center",
            color: "white",
            ...props.dropdownLabelStyle
        }),
        menu: baseStyles => ({
            ...baseStyles,
            ...defaultStyles.menu,
            // a fixed menu is placed against the viewport; the control-
            // relative offset would fling it to the screen edge
            ...(props.menuPositionStrategy == "fixed"
                ? null
                : { left: getMenuOffset() }),
            ...props.menuStyle
        }),
        option: (baseStyles) => ({
            ...baseStyles,
            ...defaultStyles.option,
            ...props.optionStyle
        })
    }), [selectInputs]);

    const selectComponents = useMemo<SelectComponentsConfig<
        Option, false, GroupBase<Option>
    >>(() => ({
        Control: controlProps => <components.Control
            {...controlProps}
            className={props.dropdownClassName}
        />,
        DropdownIndicator: props.dropdownArrowStyle?.display == "none"
            ? null
            : indicatorProps => <components.DropdownIndicator
                {...indicatorProps}
                className={props.dropdownArrowClassName}
            />,
        SingleValue: selectedValueProps => (
            <components.SingleValue
                {...selectedValueProps}
                className={props.dropdownLabelClassName}
            >
                {props.dropdownLabelRenderer
                    ? props.dropdownLabelRenderer?.(selectedValueProps.data)
                    : getLabel(selectedValueProps.data)
                }
            </components.SingleValue>
        ),
        Menu: menuProps => <components.Menu
            {...menuProps}
            className={props.menuClassName}
        />,
        Option: optionProps => <components.Option
            {...optionProps}
            className={`${styles.optionDefault} ${props.optionClassName}`}
        />
    }), [selectInputs, t]);

    return <Select
        options={props.options}
        getOptionLabel={getLabel}
        defaultValue={props.defaultValue}
        onChange={value => props.onSelect?.(value ?? undefined)}
        isSearchable={props.searchable || false}
        styles={selectStyles}
        components={selectComponents}
        maxMenuHeight={400}
        menuPosition={props.menuPositionStrategy}
    />;
}

export default DropdownSetting;