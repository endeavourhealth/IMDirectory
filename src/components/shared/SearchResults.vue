<template>
  <div id="search-results-main-container">
    <div v-if="showFilters" class="filters-container">
      <div class="p-inputgroup">
        <FloatLabel>
          <MultiSelect
            id="status"
            v-model="selectedStatus"
            :options="statusOptions"
            data-testid="status-filter"
            display="chip"
            optionLabel="name"
            @change="filterResults"
          />
          <label for="status">Select status:</label>
        </FloatLabel>
      </div>
      <div class="p-inputgroup">
        <FloatLabel>
          <MultiSelect
            id="scheme"
            v-model="selectedSchemes"
            :options="schemeOptions"
            data-testid="scheme-filter"
            display="chip"
            optionLabel="name"
            @change="filterResults"
          />
          <label for="scheme">Select scheme:</label>
        </FloatLabel>
      </div>
      <div class="p-inputgroup">
        <FloatLabel>
          <MultiSelect
            id="type"
            v-model="selectedTypes"
            :options="typeOptions"
            data-testid="type-filter"
            display="chip"
            optionLabel="name"
            @change="filterResults"
          />
          <label for="type">Select concept type:</label>
        </FloatLabel>
      </div>
    </div>
    <div v-if="showQuickTypeFilters && quickTypeFiltersAllowed" class="quick-type-filters">
      <h2 class="heading">Quick type filters</h2>
      <div class="quick-filters-container">
        <div class="radio-label-container">
          <RadioButton v-model="quickTypeFilter" :value="undefined" inputId="allQuickFilter" name="quickTypeFilter" variant="filled" />
          <label for="allQuickFilter">All</label>
        </div>
        <div v-for="(typeOption, index) in typeOptions.filter(t => quickTypeFiltersAllowed.includes(t.iri))" v-bind:key="index" class="radio-label-container">
          <RadioButton v-model="quickTypeFilter" :inputId="typeOption.name + 'QuickFilter'" :value="typeOption" name="quickTypeFilter" variant="filled" />
          <label :for="typeOption.name + 'QuickFilter'">{{ typeOption.name }}</label>
        </div>
      </div>
    </div>
    <ResultsTable
      :disablePageDropdown="disablePageDropdown"
      :im-query="imQuery"
      :pageSize="rows"
      :search-term="searchTerm"
      :selected-filter-options="selectedFilterOptions"
      :show-select="showSelect"
      :updateSearch="updateSearch"
      @addToList="(iri: string) => emit('addToList', iri)"
      @locateInTree="(iri: string) => emit('locateInTree', iri)"
      @rowSelected="updateSelected"
      @searchResultsUpdated="(searchResults: SearchResponse | undefined) => $emit('searchResultsUpdated', searchResults)"
      @viewHierarchy="(iri: string) => emit('viewHierarchy', iri)"
    />
  </div>
</template>

<script lang="ts" setup>
import { cloneDeep } from "lodash-es";
import { ComputedRef, Ref, computed, onMounted, ref, watch } from "vue";
import { IM } from "@endeavour/vue-library/enums";
import type { QueryRequest, SearchResponse, SearchResultSummary, TTIriRef } from "@endeavour/vue-library/models";
import ResultsTable from "@/components/shared/ResultsTable.vue";
import { type FilterOptions } from "@/models";
import { useFilterStore } from "@/stores/filterStore";

interface Props {
  searchTerm: string;
  updateSearch: boolean;
  selectedFilterOptions?: FilterOptions;
  rows?: number;
  showFilters?: boolean;
  showQuickTypeFilters?: boolean;
  quickTypeFiltersAllowed?: string[];
  selectedQuickTypeFilter?: string;
  imQuery?: QueryRequest;
  disablePageDropdown?: boolean;
  showSelect?: boolean;
}
const props = withDefaults(defineProps<Props>(), {
  showFilters: true,
  showQuickTypeFilters: false,
  quickTypeFiltersAllowed: () => [IM.CONCEPT, IM.VALUESET],
  rows: 20
});

const emit = defineEmits<{
  selectedUpdated: [payload: SearchResultSummary];
  locateInTree: [payload: string];
  selectedFiltersUpdated: [payload: FilterOptions];
  searchResultsUpdated: [payload: SearchResponse | undefined];
  addToList: [payload: string];
  viewHierarchy: [payload: string];
}>();

const filterStore = useFilterStore();
const storeFilterOptions: ComputedRef<FilterOptions> = computed(() => filterStore.filterOptions);
const storeFilterDefaults: ComputedRef<FilterOptions> = computed(() => filterStore.defaultFilterOptions);
const selectedSchemes: Ref<TTIriRef[]> = ref([]);
const selectedStatus: Ref<TTIriRef[]> = ref([]);
const selectedTypes: Ref<TTIriRef[]> = ref([]);
const schemeOptions: Ref<TTIriRef[]> = ref([]);
const statusOptions: Ref<TTIriRef[]> = ref([]);
const typeOptions: Ref<TTIriRef[]> = ref([]);
const quickTypeFilter: Ref<TTIriRef | undefined> = ref();

watch(quickTypeFilter, newValue => {
  if (newValue) {
    selectedTypes.value = [newValue];
  } else selectedTypes.value = cloneDeep(storeFilterDefaults.value.types);
  filterResults();
});

onMounted(() => init());

function init() {
  setFiltersFromStore();
  if (props.showQuickTypeFilters && props.selectedQuickTypeFilter) {
    const found = typeOptions.value.find(typeOption => typeOption.iri === props.selectedQuickTypeFilter);
    if (found) quickTypeFilter.value = found;
  }
}

function setFiltersFromStore() {
  schemeOptions.value = cloneDeep(storeFilterOptions.value.schemes);
  typeOptions.value = cloneDeep(storeFilterOptions.value.types);
  statusOptions.value = cloneDeep(storeFilterOptions.value.status);
  if (
    props.selectedFilterOptions &&
    (props.selectedFilterOptions.schemes.length || props.selectedFilterOptions.status.length || props.selectedFilterOptions.types.length)
  ) {
    selectedSchemes.value = cloneDeep(props.selectedFilterOptions.schemes);
    selectedStatus.value = cloneDeep(props.selectedFilterOptions.status);
    selectedTypes.value = cloneDeep(props.selectedFilterOptions.types);
  } else {
    selectedSchemes.value = storeFilterOptions.value.schemes.filter(option => storeFilterDefaults.value.schemes.findIndex(s => s.iri === option.iri) != -1);
    selectedStatus.value = storeFilterOptions.value.status.filter(option => storeFilterDefaults.value.status.findIndex(s => s.iri === option.iri) != -1);
    selectedTypes.value = storeFilterOptions.value.types.filter(option => storeFilterDefaults.value.types.findIndex(t => t.iri === option.iri) != -1);
  }
}

function filterResults() {
  const selectedFilters = {
    schemes: selectedSchemes.value,
    status: selectedStatus.value,
    types: selectedTypes.value
  } as FilterOptions;
  emit("selectedFiltersUpdated", selectedFilters);
}

function updateSelected(selected: SearchResultSummary) {
  emit("selectedUpdated", selected);
}
</script>

<style scoped>
label {
  font-size: 1rem !important;
}

#search-results-main-container {
  flex: 1 1 auto;
  overflow: auto;
  background-color: var(--p-content-background);
  display: flex;
  flex-flow: column nowrap;
}

.filters-container {
  width: 100%;
  padding-top: 1rem;
  display: flex;
  flex-flow: row wrap;
  justify-content: flex-start;
}

.p-inputgroup {
  width: 33.3%;
  padding: 0.5rem;
}
.quick-type-filters {
  display: flex;
  flex-flow: column wrap;
}
.quick-filters-container {
  display: flex;
  flex-flow: row wrap;
  gap: 0.5rem;
  padding: 0.5rem;
}
.radio-label-container {
  display: flex;
  flex-flow: row nowrap;
  /* flex: 0 0 calc(25% - 0.5rem); */
  gap: 0.25rem;
}

.radio-label-container label {
  text-transform: capitalize;
}

.heading {
  padding-left: 0.5rem;
  margin: 0;
}


</style>
