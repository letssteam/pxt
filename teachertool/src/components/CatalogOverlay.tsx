import { useContext, useMemo, useState } from "react";
import { AppStateContext } from "../state/appStateContext";
import { addCriteriaToRubric } from "../transforms/addCriteriaToRubric";
import { CatalogCriteria } from "../types/criteria";
import { getCatalogCriteria } from "../state/helpers";
import { ReadOnlyCriteriaDisplay } from "./ReadonlyCriteriaDisplay";
import { Strings } from "../constants";
import { Button } from "react-common/components/controls/Button";
import { getReadableCriteriaTemplate, makeToast } from "../utils";
import { setCatalogOpen } from "../transforms/setCatalogOpen";
import { classList } from "react-common/components/util";
import { announceToScreenReader } from "../transforms/announceToScreenReader";
import { FocusTrap } from "react-common/components/controls/FocusTrap";
import css from "./styling/CatalogOverlay.module.scss";

interface CatalogHeaderProps {
    onClose: () => void;
}
const CatalogHeader: React.FC<CatalogHeaderProps> = ({ onClose }) => {
    return (
        <div className={css["header"]}>
            <span className={css["title"]}>{Strings.SelectCriteriaDescription}</span>
            <Button
                className={css["close-button"]}
                rightIcon="fas fa-times-circle"
                onClick={onClose}
                title={Strings.Close}
            />
        </div>
    );
};

interface CatalogItemLabelProps {
    catalogCriteria: CatalogCriteria;
    allowsMultiple: boolean;
    existingInstanceCount: number;
    recentlyAdded: boolean;
}
const CatalogItemLabel: React.FC<CatalogItemLabelProps> = ({
    catalogCriteria,
    allowsMultiple,
    existingInstanceCount,
    recentlyAdded,
}) => {
    const canAddMore = allowsMultiple || existingInstanceCount === 0;
    const showRecentlyAddedIndicator = recentlyAdded && canAddMore;
    return (
        <div className={css["catalog-item-label"]}>
            <div className={css["action-indicators"]}>
                {canAddMore ? (
                    <>
                        <i
                            className={classList(
                                "fas fa-check",
                                css["recently-added-indicator"],
                                showRecentlyAddedIndicator ? undefined : css["hide-indicator"]
                            )}
                            title={lf("Added!")}
                        />
                        <i
                            className={classList(
                                "fas fa-plus",
                                showRecentlyAddedIndicator ? css["hide-indicator"] : undefined
                            )}
                            title={Strings.AddToChecklist}
                        />
                    </>
                ) : (
                    <span className={css["max-label"]}>{Strings.Max}</span>
                )}
            </div>
            <ReadOnlyCriteriaDisplay catalogCriteria={catalogCriteria} showDescription={true} />
        </div>
    );
};

const CatalogList: React.FC = () => {
    const { state: teacherTool } = useContext(AppStateContext);

    const recentlyAddedWindowMs = 500;
    const [recentlyAddedIds, setRecentlyAddedIds] = useState<pxsim.Map<NodeJS.Timeout>>({});

    const criteria = useMemo<CatalogCriteria[]>(
        () => getCatalogCriteria(teacherTool),
        [teacherTool.catalog, teacherTool.rubric]
    );

    function updateRecentlyAddedValue(id: string, value: NodeJS.Timeout | undefined) {
        setRecentlyAddedIds(prevState => {
            const newState = { ...prevState };
            if (value) {
                newState[id] = value;
            } else {
                delete newState[id];
            }
            return newState;
        });
    }

    function onItemClicked(c: CatalogCriteria) {
        addCriteriaToRubric([c.id]);

        // Set a timeout to remove the recently added indicator
        // and save it in the state.
        if (recentlyAddedIds[c.id]) {
            clearTimeout(recentlyAddedIds[c.id]);
        }
        const timeoutId = setTimeout(() => {
            updateRecentlyAddedValue(c.id, undefined);
        }, recentlyAddedWindowMs);
        updateRecentlyAddedValue(c.id, timeoutId);

        announceToScreenReader(lf("Added '{0}' to checklist.", getReadableCriteriaTemplate(c)));
    }

    return (
        <div className={css["catalog-list"]}>
            {criteria.map(c => {
                const allowsMultiple = c.params !== undefined && c.params.length !== 0; // TODO add a json flag for this (MaxCount or AllowMultiple)
                const existingInstanceCount = teacherTool.rubric.criteria.filter(
                    i => i.catalogCriteriaId === c.id
                ).length;
                return (
                    c.template && (
                        <Button
                            id={`criteria_${c.id}`}
                            title={getReadableCriteriaTemplate(c)}
                            key={c.id}
                            className={css["catalog-item"]}
                            label={
                                <CatalogItemLabel
                                    catalogCriteria={c}
                                    allowsMultiple={allowsMultiple}
                                    existingInstanceCount={existingInstanceCount}
                                    recentlyAdded={recentlyAddedIds[c.id] !== undefined}
                                />
                            }
                            onClick={() => onItemClicked(c)}
                            disabled={!allowsMultiple && existingInstanceCount > 0}
                        />
                    )
                );
            })}
        </div>
    );
};

interface CatalogOverlayProps {}
export const CatalogOverlay: React.FC<CatalogOverlayProps> = ({}) => {
    const { state: teacherTool } = useContext(AppStateContext);

    function closeOverlay() {
        setCatalogOpen(false);
    }

    return teacherTool.catalogOpen ? (
        <FocusTrap onEscape={() => {}}>
            <div className={css["catalog-overlay"]}>
                <div className={css["catalog-content-container"]}>
                    <CatalogHeader onClose={closeOverlay} />
                    <CatalogList />
                </div>
            </div>
        </FocusTrap>
    ) : null;
};