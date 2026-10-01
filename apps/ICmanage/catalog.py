from .models import ICSetting


def database_catalog():
    catalog = {"rx": {}, "charger": {}, "rxFixed": {}, "chargerFixed": {}}
    settings = list(ICSetting.objects.all())
    for item in settings:
        if item.mode == "fixed":
            catalog[item.kind + "Fixed"][item.code] = item.efficiency
        else:
            # All browser lookup paths use amperes; keep stored mA points editable as entered.
            axis = "current" if item.axis == "ma" else item.axis
            points = [[x / 1000, efficiency] for x, efficiency in item.points] if item.axis == "ma" else item.points
            catalog[item.kind][item.code] = {"axis": axis, "data": points, "src": item.source}
    return catalog, settings
